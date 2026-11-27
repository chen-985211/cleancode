{
  "targets": [{
    "target_name": "windows-snap-layout",
    "sources": ["snap_layout.cc"],
    "libraries": ["comctl32.lib", "user32.lib"],
    "defines": ["UNICODE", "_UNICODE", "NOMINMAX"]
  }]
}
