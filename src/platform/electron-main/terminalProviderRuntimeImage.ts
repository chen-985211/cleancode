import { createHash, randomUUID } from 'node:crypto'
import { constants, type Stats } from 'node:fs'
import { access, copyFile, mkdir, readdir, rename, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import {
  acquireRuntimeImagePublishLock,
  type RuntimeImagePublishLockLease
} from './TerminalProviderRuntimeImagePublishLock'
import type { TerminalProviderArchiveFileSystem } from './terminalProviderRuntimeEnvironment'
import {
  areRuntimeDataFingerprintsEqual,
  areRuntimeFileStatsEqual,
  materializedMarkerName,
  readRuntimeImageMarker,
  type RuntimeDataFingerprint,
  type RuntimeFileStatFingerprint,
  type RuntimeImageMarker,
  writeRuntimeImageMarker
} from './terminalProviderRuntimeImageManifest'
import {
  copyPath,
  getErrorCode,
  isPathInside,
  isProcessAlive,
  isRuntimeNodePtyPath,
  isSafeImageKey,
  listRuntimeNodePtyFiles,
  pruneUnusedRuntimeImages,
  quarantineIncompleteImage,
  readFileStatFingerprint,
  readRuntimeDataFingerprint,
  reserveRuntimeImage,
  resolveRuntimeImagePin,
  type RuntimeImageRetirementFileSystem,
  sanitizePathSegment,
  sha256,
  toContainedRelativePath,
  updateDigestFile
} from './terminalProviderRuntimeImageSupport'

export {
  createElectronArchiveFileSystem,
  resolveTerminalProviderRuntimeRootDirectory
} from './terminalProviderRuntimeEnvironment'

export interface TerminalProviderLaunchTarget {
  readonly executablePath: string
  readonly providerEntryPath: string
  readonly runtimeImageKey?: string
}

export interface TerminalProviderRuntimeImageOptions {
  readonly archiveFileSystem: TerminalProviderArchiveFileSystem
  readonly applicationVersion: string
  readonly architecture: string
  readonly electronVersion: string
  readonly executablePath: string
  readonly isPackaged: boolean
  readonly platform: NodeJS.Platform
  readonly providerEntryPath: string
  readonly providerStateDirectory: string
  readonly resourcesPath: string
  readonly runtimeRootDirectory: string
  readonly retirementFileSystem?: RuntimeImageRetirementFileSystem
  readonly isProcessAlive?: (processId: number) => boolean
  readonly onFailure?: (error: unknown) => void
}

interface RuntimeImageSources {
  readonly applicationDirectory: string
  readonly appAsarPath: string
  readonly nodePtyDirectory: string
  readonly providerEntryRelativePath: string
  readonly requiredNativeRuntimePaths: readonly string[]
}

interface RuntimeClosureFile {
  readonly imageRelativePath: string
  readonly imageStat: (path: string) => Promise<Stats>
  readonly sourcePath: string
  readonly sourceRelativePath: string
  readonly sourceStat: (path: string) => Promise<Stats>
}

interface RuntimeImageIdentity {
  readonly applicationArchiveSha256: string
  readonly executableSha256: string
  readonly imageKey: string
  readonly nativeRuntimeFiles: readonly RuntimeFileFingerprint[]
  readonly runtimeDataFiles: readonly RuntimeDataFingerprint[]
  readonly sourceFiles: readonly RuntimeFileStatFingerprint[]
}

interface RuntimeImageDescriptor {
  readonly identity: RuntimeImageIdentity
  readonly sources: RuntimeImageSources
}

interface ValidatedRuntimeImage {
  readonly imageFiles: readonly RuntimeFileStatFingerprint[]
  readonly target: TerminalProviderLaunchTarget
}

interface RuntimeFileFingerprint {
  readonly relativePath: string
  readonly sha256: string
}

const runtimeImageExecutableName = 'cleancode-terminal-provider.exe'
const requiredRuntimeDataFileNames = ['icudtl.dat', 'v8_context_snapshot.bin'] as const
const optionalRuntimeDataFileNames = ['snapshot_blob.bin'] as const
export { terminalProviderRetiredRuntimeImageRetentionMs } from './terminalProviderRuntimeImageSupport'

export class TerminalProviderRuntimeImageManager {
  private descriptorPromise: Promise<RuntimeImageDescriptor> | null = null
  private resolutionPromise: Promise<TerminalProviderLaunchTarget> | null = null
  private resolvedImageKey: string | null = null
  private warmTargetPromise: Promise<TerminalProviderLaunchTarget | null> | null = null

  constructor(private readonly options: TerminalProviderRuntimeImageOptions) {}

  resolveLaunchTarget(): Promise<TerminalProviderLaunchTarget> {
    const fallback = this.createInstalledLaunchTarget()
    if (!this.shouldRelocate()) return Promise.resolve(fallback)
    if (this.resolutionPromise) return this.resolutionPromise

    const pending = this.resolveRelocatedLaunchTarget(fallback)
    this.resolutionPromise = pending
    void pending
      .finally(() => {
        if (this.resolutionPromise === pending) this.resolutionPromise = null
      })
      .catch(() => undefined)
    return pending
  }

  private async resolveRelocatedLaunchTarget(
    fallback: TerminalProviderLaunchTarget
  ): Promise<TerminalProviderLaunchTarget> {
    const warmTarget = await this.readWarmMaterializedTarget().catch(() => null)
    if (warmTarget) {
      this.resolvedImageKey = warmTarget.runtimeImageKey ?? null
      return warmTarget
    }

    let stagingDirectory: string | null = null
    let quarantineDirectory: string | null = null
    let publishLock: RuntimeImagePublishLockLease | null = null
    try {
      const { identity, sources } = await this.readRuntimeImageDescriptor()
      const { imageKey } = identity
      await mkdir(this.options.runtimeRootDirectory, { recursive: true })
      publishLock = await acquireRuntimeImagePublishLock(
        this.options.runtimeRootDirectory,
        imageKey,
        this.options.isProcessAlive ?? isProcessAlive
      )
      await publishLock.assertOwned()
      const lockedExisting = await this.readFullyValidatedTarget(identity)
      if (lockedExisting) {
        await this.writeMarker(
          join(this.options.runtimeRootDirectory, imageKey),
          this.createMarker(identity, sources, lockedExisting.imageFiles),
          true
        )
        await publishLock.assertOwned()
        await reserveRuntimeImage(this.options, imageKey)
        await publishLock.assertOwned()
        this.resolvedImageKey = imageKey
        return lockedExisting.target
      }
      quarantineDirectory = await quarantineIncompleteImage(
        this.options.runtimeRootDirectory,
        imageKey
      )
      stagingDirectory = join(
        this.options.runtimeRootDirectory,
        `${imageKey}.staging-${process.pid}-${randomUUID()}`
      )
      await this.copyRuntimeClosure(sources, stagingDirectory, identity.runtimeDataFiles)
      await publishLock.assertOwned()
      const imageFiles = await this.validateCopiedRuntimeClosure(
        stagingDirectory,
        sources,
        identity
      )
      if (!imageFiles) {
        throw new Error('Staged terminal Provider runtime image did not match its content key.')
      }
      await this.writeMarker(
        stagingDirectory,
        this.createMarker(identity, sources, imageFiles),
        false
      )
      await publishLock.assertOwned()
      const imageDirectory = join(this.options.runtimeRootDirectory, imageKey)
      await rename(stagingDirectory, imageDirectory)
      stagingDirectory = null
      await publishLock.assertOwned()
      await reserveRuntimeImage(this.options, imageKey)
      await publishLock.assertOwned()
      const published = this.createImageTarget(imageDirectory, imageKey, sources)
      this.resolvedImageKey = imageKey
      return published
    } catch (error) {
      this.options.onFailure?.(error)
      return fallback
    } finally {
      if (stagingDirectory) {
        await rm(stagingDirectory, { force: true, recursive: true }).catch(() => undefined)
      }
      if (quarantineDirectory) {
        await rm(quarantineDirectory, { force: true, recursive: true }).catch(() => undefined)
      }
      await publishLock?.close().catch(() => undefined)
    }
  }

  async pruneUnusedImages(): Promise<void> {
    if (!this.shouldRelocate()) return

    const currentImageKey = await this.resolveCurrentImageKey()
    if (!currentImageKey) return
    await pruneUnusedRuntimeImages({
      currentImageKey,
      processIsAlive: this.options.isProcessAlive ?? isProcessAlive,
      readPinnedImage: () => this.readPinnedImageKey(),
      runtimeRootDirectory: this.options.runtimeRootDirectory
    })
  }

  private async resolveCurrentImageKey(): Promise<string | null> {
    if (this.resolvedImageKey) return this.resolvedImageKey
    if (this.resolutionPromise) {
      return (await this.resolutionPromise).runtimeImageKey ?? null
    }
    const warmTarget = await this.readWarmMaterializedTarget().catch(() => null)
    if (warmTarget?.runtimeImageKey) {
      this.resolvedImageKey = warmTarget.runtimeImageKey
      return warmTarget.runtimeImageKey
    }
    return null
  }

  private readWarmMaterializedTarget(): Promise<TerminalProviderLaunchTarget | null> {
    if (this.warmTargetPromise) return this.warmTargetPromise
    const pending = this.findWarmMaterializedTarget()
    this.warmTargetPromise = pending
    void pending
      .finally(() => {
        if (this.warmTargetPromise === pending) this.warmTargetPromise = null
      })
      .catch(() => undefined)
    return pending
  }

  private async findWarmMaterializedTarget(): Promise<TerminalProviderLaunchTarget | null> {
    const sources = this.collectSources()
    const closure = await this.readSourceClosure(sources)
    const entries = await readdir(this.options.runtimeRootDirectory, {
      withFileTypes: true
    }).catch(() => [])
    for (const entry of entries.sort((first, second) => first.name.localeCompare(second.name))) {
      if (!entry.isDirectory() || !isSafeImageKey(entry.name)) continue
      const imageDirectory = join(this.options.runtimeRootDirectory, entry.name)
      const marker = await readRuntimeImageMarker(join(imageDirectory, materializedMarkerName))
      if (!this.markerMatchesBuild(marker, entry.name, sources, closure.sourceFiles)) continue
      const imageFiles = await this.readImageClosureStats(imageDirectory, closure.files).catch(
        () => null
      )
      if (!imageFiles || !areRuntimeFileStatsEqual(marker.imageFiles, imageFiles)) continue
      const publishLock = await acquireRuntimeImagePublishLock(
        this.options.runtimeRootDirectory,
        entry.name,
        this.options.isProcessAlive ?? isProcessAlive
      )
      try {
        await publishLock.assertOwned()
        const lockedMarker = await readRuntimeImageMarker(
          join(imageDirectory, materializedMarkerName)
        )
        const lockedImageFiles = await this.readImageClosureStats(
          imageDirectory,
          closure.files
        ).catch(() => null)
        if (
          !this.markerMatchesBuild(lockedMarker, entry.name, sources, closure.sourceFiles) ||
          !lockedImageFiles ||
          !areRuntimeFileStatsEqual(lockedMarker.imageFiles, lockedImageFiles)
        ) {
          continue
        }
        await reserveRuntimeImage(this.options, entry.name)
        await publishLock.assertOwned()
        return this.createImageTarget(imageDirectory, entry.name, sources)
      } finally {
        await publishLock.close()
      }
    }
    return null
  }

  private markerMatchesBuild(
    marker: RuntimeImageMarker | null,
    imageKey: string,
    sources: RuntimeImageSources,
    sourceFiles: readonly RuntimeFileStatFingerprint[]
  ): marker is RuntimeImageMarker {
    return (
      marker !== null &&
      marker.imageKey === imageKey &&
      marker.applicationVersion === this.options.applicationVersion &&
      marker.electronVersion === this.options.electronVersion &&
      marker.architecture === this.options.architecture &&
      marker.providerEntryRelativePath === sources.providerEntryRelativePath &&
      areRuntimeFileStatsEqual(marker.sourceFiles, sourceFiles)
    )
  }

  private shouldRelocate(): boolean {
    return this.options.platform === 'win32' && this.options.isPackaged
  }

  private createInstalledLaunchTarget(): TerminalProviderLaunchTarget {
    return {
      executablePath: this.options.executablePath,
      providerEntryPath: this.options.providerEntryPath
    }
  }

  private collectSources(): RuntimeImageSources {
    const applicationDirectory = dirname(this.options.executablePath)
    const providerEntryRelativePath = toContainedRelativePath(
      applicationDirectory,
      this.options.providerEntryPath
    )
    const nodePtyDirectory = join(
      this.options.resourcesPath,
      'app.asar.unpacked',
      'node_modules',
      'node-pty'
    )
    const conptyReleaseDirectory = join(nodePtyDirectory, 'build', 'Release')
    return {
      applicationDirectory,
      appAsarPath: join(this.options.resourcesPath, 'app.asar'),
      nodePtyDirectory,
      providerEntryRelativePath,
      requiredNativeRuntimePaths: [
        join(conptyReleaseDirectory, 'conpty.node'),
        join(conptyReleaseDirectory, 'conpty', 'conpty.dll'),
        join(conptyReleaseDirectory, 'conpty', 'OpenConsole.exe')
      ]
    }
  }

  private readRuntimeImageDescriptor(): Promise<RuntimeImageDescriptor> {
    if (this.descriptorPromise) return this.descriptorPromise
    const sources = this.collectSources()
    const pending = this.createImageIdentity(sources).then((identity) => ({ identity, sources }))
    this.descriptorPromise = pending
    void pending.catch(() => {
      if (this.descriptorPromise === pending) this.descriptorPromise = null
    })
    return pending
  }

  private async createImageIdentity(sources: RuntimeImageSources): Promise<RuntimeImageIdentity> {
    const sourceBefore = await this.readSourceClosure(sources)
    const runtimeDataFiles = await this.readRuntimeDataFingerprints(sources.applicationDirectory)
    await Promise.all(
      sources.requiredNativeRuntimePaths.map((path) => access(path, constants.R_OK))
    )
    const nativeClosureFiles = sourceBefore.files.filter((file) =>
      isPathInside(sources.nodePtyDirectory, file.sourcePath)
    )
    const [executable, applicationArchive, nativeRuntimeContents] = await Promise.all([
      this.options.archiveFileSystem.readFile(this.options.executablePath),
      this.options.archiveFileSystem.readFile(sources.appAsarPath),
      Promise.all(
        nativeClosureFiles.map(({ sourcePath }) =>
          this.options.archiveFileSystem.readFile(sourcePath)
        )
      )
    ])
    const sourceAfter = await this.readSourceClosure(sources)
    if (!areRuntimeFileStatsEqual(sourceBefore.sourceFiles, sourceAfter.sourceFiles)) {
      throw new Error('Terminal Provider runtime sources changed while their content was hashed.')
    }
    const digest = createHash('sha256')
      .update('cleancode-terminal-provider-runtime-v1\0')
      .update(this.options.applicationVersion)
      .update('\0')
      .update(this.options.electronVersion)
      .update('\0')
      .update(this.options.architecture)
      .update('\0')
    updateDigestFile(digest, runtimeImageExecutableName, executable)
    updateDigestFile(digest, 'resources/app.asar', applicationArchive)
    runtimeDataFiles.forEach((file) => {
      digest.update(file.name).update('\0').update(file.sha256).update('\0')
    })
    nativeRuntimeContents.forEach((contents, index) => {
      updateDigestFile(digest, nativeClosureFiles[index]!.sourceRelativePath, contents)
    })
    const contentDigest = digest.digest('hex').slice(0, 16)
    return {
      applicationArchiveSha256: sha256(applicationArchive),
      executableSha256: sha256(executable),
      imageKey: `${sanitizePathSegment(this.options.applicationVersion)}-${contentDigest}`,
      nativeRuntimeFiles: nativeRuntimeContents.map((contents, index) => ({
        relativePath: nativeClosureFiles[index]!.imageRelativePath,
        sha256: sha256(contents)
      })),
      runtimeDataFiles,
      sourceFiles: sourceAfter.sourceFiles
    }
  }

  private async readSourceClosure(sources: RuntimeImageSources): Promise<{
    readonly files: readonly RuntimeClosureFile[]
    readonly sourceFiles: readonly RuntimeFileStatFingerprint[]
  }> {
    const runtimeDataNames: string[] = [...requiredRuntimeDataFileNames]
    for (const name of optionalRuntimeDataFileNames) {
      try {
        await stat(join(sources.applicationDirectory, name))
        runtimeDataNames.push(name)
      } catch (error) {
        if (getErrorCode(error) !== 'ENOENT' && getErrorCode(error) !== 'ENOTDIR') throw error
      }
    }
    const nativeRuntimePaths = await listRuntimeNodePtyFiles(
      sources.nodePtyDirectory,
      this.options.architecture
    )
    const files = [
      this.createClosureFile(
        sources,
        this.options.executablePath,
        runtimeImageExecutableName,
        stat
      ),
      ...runtimeDataNames.map((name) =>
        this.createClosureFile(sources, join(sources.applicationDirectory, name), name, stat)
      ),
      this.createClosureFile(
        sources,
        sources.appAsarPath,
        toContainedRelativePath(sources.applicationDirectory, sources.appAsarPath),
        (path) => this.options.archiveFileSystem.stat(path)
      ),
      ...nativeRuntimePaths.map((path) =>
        this.createClosureFile(
          sources,
          path,
          toContainedRelativePath(sources.applicationDirectory, path),
          stat
        )
      )
    ].sort((first, second) => first.sourceRelativePath.localeCompare(second.sourceRelativePath))
    const sourceFiles = await Promise.all(
      files.map((file) =>
        readFileStatFingerprint(file.sourcePath, file.sourceRelativePath, file.sourceStat)
      )
    )
    return { files, sourceFiles }
  }

  private createClosureFile(
    sources: RuntimeImageSources,
    sourcePath: string,
    imageRelativePath: string,
    sourceStat: (path: string) => Promise<Stats>,
    imageStat = sourceStat
  ): RuntimeClosureFile {
    return {
      imageRelativePath,
      imageStat,
      sourcePath,
      sourceRelativePath: toContainedRelativePath(sources.applicationDirectory, sourcePath),
      sourceStat
    }
  }

  private readImageClosureStats(
    imageDirectory: string,
    files: readonly RuntimeClosureFile[]
  ): Promise<readonly RuntimeFileStatFingerprint[]> {
    return Promise.all(
      files.map(({ imageRelativePath, imageStat }) =>
        readFileStatFingerprint(
          join(imageDirectory, ...imageRelativePath.split('/')),
          imageRelativePath,
          imageStat
        )
      )
    )
  }

  private async readRuntimeDataFingerprints(
    applicationDirectory: string
  ): Promise<readonly RuntimeDataFingerprint[]> {
    const required = await Promise.all(
      requiredRuntimeDataFileNames.map((name) =>
        readRuntimeDataFingerprint(
          applicationDirectory,
          name,
          this.options.archiveFileSystem.readFile
        )
      )
    )
    const optional = await Promise.all(
      optionalRuntimeDataFileNames.map(async (name) => {
        try {
          return await readRuntimeDataFingerprint(
            applicationDirectory,
            name,
            this.options.archiveFileSystem.readFile
          )
        } catch (error) {
          if (getErrorCode(error) === 'ENOENT') return null
          throw error
        }
      })
    )
    return [...required, ...optional.filter((value) => value !== null)]
  }

  private async copyRuntimeClosure(
    sources: RuntimeImageSources,
    stagingDirectory: string,
    runtimeDataFiles: readonly RuntimeDataFingerprint[]
  ): Promise<void> {
    await mkdir(stagingDirectory, { recursive: true })
    await copyFile(this.options.executablePath, join(stagingDirectory, runtimeImageExecutableName))
    await Promise.all(
      runtimeDataFiles.map(({ name }) =>
        copyFile(join(sources.applicationDirectory, name), join(stagingDirectory, name))
      )
    )

    const appAsarDestination = join(
      stagingDirectory,
      ...toContainedRelativePath(sources.applicationDirectory, sources.appAsarPath).split('/')
    )
    const nodePtyDestination = join(
      stagingDirectory,
      ...toContainedRelativePath(sources.applicationDirectory, sources.nodePtyDirectory).split('/')
    )
    await mkdir(dirname(appAsarDestination), { recursive: true })
    await Promise.all([
      this.options.archiveFileSystem.copyFile(sources.appAsarPath, appAsarDestination),
      copyPath(sources.nodePtyDirectory, nodePtyDestination, (sourcePath) =>
        isRuntimeNodePtyPath(sourcePath, this.options.architecture)
      )
    ])
  }

  private writeMarker(
    directory: string,
    marker: RuntimeImageMarker,
    replace: boolean
  ): Promise<void> {
    return writeRuntimeImageMarker(join(directory, materializedMarkerName), marker, replace)
  }

  private createMarker(
    identity: RuntimeImageIdentity,
    sources: RuntimeImageSources,
    imageFiles: readonly RuntimeFileStatFingerprint[]
  ): RuntimeImageMarker {
    return {
      schemaVersion: 2,
      imageKey: identity.imageKey,
      applicationVersion: this.options.applicationVersion,
      electronVersion: this.options.electronVersion,
      architecture: this.options.architecture,
      completedAt: new Date().toISOString(),
      providerEntryRelativePath: sources.providerEntryRelativePath,
      runtimeDataFiles: identity.runtimeDataFiles,
      sourceFiles: identity.sourceFiles,
      imageFiles
    }
  }

  private async readFullyValidatedTarget(
    identity: RuntimeImageIdentity
  ): Promise<ValidatedRuntimeImage | null> {
    const { imageKey } = identity
    const imageDirectory = join(this.options.runtimeRootDirectory, imageKey)
    const sources = this.collectSources()
    const marker = await readRuntimeImageMarker(join(imageDirectory, materializedMarkerName))
    if (
      !marker ||
      marker.imageKey !== imageKey ||
      marker.applicationVersion !== this.options.applicationVersion ||
      marker.electronVersion !== this.options.electronVersion ||
      marker.architecture !== this.options.architecture ||
      marker.providerEntryRelativePath !== sources.providerEntryRelativePath ||
      !areRuntimeDataFingerprintsEqual(marker.runtimeDataFiles, identity.runtimeDataFiles)
    ) {
      return null
    }
    const imageFiles = await this.validateCopiedRuntimeClosure(imageDirectory, sources, identity)
    if (!imageFiles) return null
    return {
      imageFiles,
      target: this.createImageTarget(imageDirectory, imageKey, sources)
    }
  }

  private async validateCopiedRuntimeClosure(
    imageDirectory: string,
    sources: RuntimeImageSources,
    identity: RuntimeImageIdentity
  ): Promise<readonly RuntimeFileStatFingerprint[] | null> {
    try {
      const sourceClosure = await this.readSourceClosure(sources)
      if (!areRuntimeFileStatsEqual(sourceClosure.sourceFiles, identity.sourceFiles)) return null
      const imageFilesBefore = await this.readImageClosureStats(imageDirectory, sourceClosure.files)
      const appAsarPath = join(
        imageDirectory,
        ...toContainedRelativePath(sources.applicationDirectory, sources.appAsarPath).split('/')
      )
      const [executable, applicationArchive, nativeRuntimeFiles, runtimeDataIsValid] =
        await Promise.all([
          this.options.archiveFileSystem.readFile(join(imageDirectory, runtimeImageExecutableName)),
          this.options.archiveFileSystem.readFile(appAsarPath),
          Promise.all(
            identity.nativeRuntimeFiles.map(({ relativePath }) =>
              this.options.archiveFileSystem.readFile(
                join(imageDirectory, ...relativePath.split('/'))
              )
            )
          ),
          this.validateRuntimeDataFiles(imageDirectory, identity.runtimeDataFiles)
        ])
      const contentsAreValid =
        sha256(executable) === identity.executableSha256 &&
        sha256(applicationArchive) === identity.applicationArchiveSha256 &&
        nativeRuntimeFiles.every(
          (contents, index) => sha256(contents) === identity.nativeRuntimeFiles[index]?.sha256
        ) &&
        runtimeDataIsValid
      if (!contentsAreValid) return null
      const imageFilesAfter = await this.readImageClosureStats(imageDirectory, sourceClosure.files)
      return areRuntimeFileStatsEqual(imageFilesBefore, imageFilesAfter) ? imageFilesAfter : null
    } catch {
      return null
    }
  }

  private createImageTarget(
    imageDirectory: string,
    imageKey: string,
    sources: RuntimeImageSources
  ): TerminalProviderLaunchTarget {
    return {
      executablePath: join(imageDirectory, runtimeImageExecutableName),
      providerEntryPath: join(imageDirectory, ...sources.providerEntryRelativePath.split('/')),
      runtimeImageKey: imageKey
    }
  }

  private async validateRuntimeDataFiles(
    imageDirectory: string,
    expected: readonly RuntimeDataFingerprint[]
  ): Promise<boolean> {
    const actual = await Promise.all(
      expected.map(({ name }) =>
        readRuntimeDataFingerprint(
          imageDirectory,
          name,
          this.options.archiveFileSystem.readFile
        ).catch(() => null)
      )
    )
    return actual.every(
      (value, index) => value !== null && value.sha256 === expected[index]?.sha256
    )
  }

  private readPinnedImageKey() {
    return resolveRuntimeImagePin(
      this.options.providerStateDirectory,
      this.options.isProcessAlive ?? isProcessAlive
    )
  }
}
