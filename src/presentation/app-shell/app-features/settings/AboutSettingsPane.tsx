import packageJson from '../../../../../package.json'
import { useI18n } from '../../../i18n/useI18n'

export function AboutSettingsPane() {
  const { t } = useI18n()

  return (
    <section className="about-settings-pane" aria-label={t('settings.about.title')}>
      <div className="about-settings-product">
        <img
          className="about-settings-product__icon"
          src={`${import.meta.env.BASE_URL}app-icon.svg`}
          width={104}
          height={104}
          alt=""
        />
        <h2>{packageJson.productName}</h2>
        <dl>
          <div>
            <dt>{t('settings.about.version')}</dt>
            <dd>{packageJson.version}</dd>
          </div>
        </dl>
      </div>
    </section>
  )
}
