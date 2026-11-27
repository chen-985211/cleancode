#include <windows.h>
#include <windowsx.h>
#include <commctrl.h>
#include <node_api.h>
#include <cstring>
#include <new>

namespace {
// All subclasses run on the Electron UI thread. Only a posted hover transition
// crosses into JavaScript; hit testing itself must return synchronously to Win32.
const UINT hover_message = RegisterWindowMessageW(L"CleanCode.SnapButtonHover");
constexpr UINT_PTR subclass_id = 1;

struct Button {
  RECT bounds{};
  bool hovered = false;
  bool pressed = false;
};

LRESULT CALLBACK WindowProc(HWND, UINT, WPARAM, LPARAM, UINT_PTR, DWORD_PTR);
LRESULT CALLBACK ChildProc(HWND, UINT, WPARAM, LPARAM, UINT_PTR, DWORD_PTR);

Button* FindButton(HWND window) {
  DWORD_PTR data = 0;
  if (!GetWindowSubclass(window, WindowProc, subclass_id, &data)) return nullptr;
  return reinterpret_cast<Button*>(data);
}

bool Contains(HWND window, const Button& button, LPARAM screen_position) {
  POINT point{GET_X_LPARAM(screen_position), GET_Y_LPARAM(screen_position)};
  return ScreenToClient(window, &point) && PtInRect(&button.bounds, point);
}

void SetHover(HWND window, Button& button, bool hovered) {
  if (hovered == button.hovered) return;
  button.hovered = hovered;
  if (hovered) {
    TRACKMOUSEEVENT track{sizeof(track), TME_NONCLIENT | TME_LEAVE, window, 0};
    TrackMouseEvent(&track);
  }
  PostMessageW(window, hover_message, hovered, 0);
}

BOOL CALLBACK AttachChild(HWND child, LPARAM root) {
  if (GetWindowThreadProcessId(child, nullptr) == GetCurrentThreadId()) {
    SetWindowSubclass(child, ChildProc, subclass_id, static_cast<DWORD_PTR>(root));
  }
  return TRUE;
}

void AttachNewChild(WPARAM event, LPARAM child, HWND root) {
  if (LOWORD(event) != WM_CREATE) return;
  auto hwnd = reinterpret_cast<HWND>(child);
  AttachChild(hwnd, reinterpret_cast<LPARAM>(root));
  EnumChildWindows(hwnd, AttachChild, reinterpret_cast<LPARAM>(root));
}

LRESULT CALLBACK ChildProc(HWND hwnd, UINT msg, WPARAM w, LPARAM l, UINT_PTR, DWORD_PTR root) {
  auto window = reinterpret_cast<HWND>(root);
  if (msg == WM_NCHITTEST) {
    auto* button = FindButton(window);
    // Chromium's renderer child covers the titlebar. Pass through this one
    // rectangle so the system queries the actual top-level window.
    if (button && Contains(window, *button, l)) return HTTRANSPARENT;
  } else if (msg == WM_PARENTNOTIFY) {
    AttachNewChild(w, l, window);
  } else if (msg == WM_NCDESTROY) {
    RemoveWindowSubclass(hwnd, ChildProc, subclass_id);
  }
  return DefSubclassProc(hwnd, msg, w, l);
}

LRESULT CALLBACK WindowProc(HWND window, UINT msg, WPARAM w, LPARAM l, UINT_PTR, DWORD_PTR data) {
  auto& button = *reinterpret_cast<Button*>(data);
  switch (msg) {
    case WM_NCHITTEST:
      if (Contains(window, button, l)) return HTMAXBUTTON;
      break;
    case WM_NCMOUSEMOVE:
      SetHover(window, button, w == HTMAXBUTTON);
      if (w == HTMAXBUTTON) return DefWindowProcW(window, msg, w, l);
      break;
    case WM_NCMOUSELEAVE:
      SetHover(window, button, false);
      break;
    case WM_NCLBUTTONDOWN:
    case WM_NCLBUTTONDBLCLK:
      if (w == HTMAXBUTTON) {
        button.pressed = true;
        SetCapture(window);
        return 0;
      }
      break;
    case WM_LBUTTONUP:
      if (button.pressed) {
        POINT point{GET_X_LPARAM(l), GET_Y_LPARAM(l)};
        bool activate = PtInRect(&button.bounds, point);
        button.pressed = false;
        ReleaseCapture();
        if (activate) {
          PostMessageW(window, WM_SYSCOMMAND, IsZoomed(window) ? SC_RESTORE : SC_MAXIMIZE, 0);
        }
        return 0;
      }
      break;
    case WM_CAPTURECHANGED:
    case WM_CANCELMODE:
      button.pressed = false;
      break;
    case WM_PARENTNOTIFY:
      AttachNewChild(w, l, window);
      break;
    case WM_NCDESTROY:
      RemoveWindowSubclass(window, WindowProc, subclass_id);
      delete &button;
      break;
  }
  return DefSubclassProc(window, msg, w, l);
}

napi_value SetBounds(napi_env env, napi_callback_info info) {
  napi_value args[5];
  size_t count = 5, size = 0;
  void* bytes = nullptr;
  napi_get_cb_info(env, info, &count, args, nullptr, nullptr);
  HWND window = nullptr;
  if (count != 5 || napi_get_buffer_info(env, args[0], &bytes, &size) != napi_ok ||
      size != sizeof(window)) {
    napi_throw_type_error(env, nullptr, "Expected the native handle of this BrowserWindow.");
    return nullptr;
  }
  std::memcpy(&window, bytes, size);
  if (GetWindowThreadProcessId(window, nullptr) != GetCurrentThreadId()) {
    napi_throw_error(env, nullptr, "The window does not belong to the current UI thread.");
    return nullptr;
  }
  int32_t v[4];
  for (size_t i = 0; i < 4; ++i) {
    if (napi_get_value_int32(env, args[i + 1], &v[i]) != napi_ok) {
      napi_throw_type_error(env, nullptr, "Expected an integer button rectangle.");
      return nullptr;
    }
  }
  Button* button = FindButton(window);
  RECT rect{v[0], v[1], v[0] + v[2], v[1] + v[3]};
  if (!button && !IsRectEmpty(&rect)) {
    button = new (std::nothrow) Button{};
    if (!button || !SetWindowSubclass(window, WindowProc, subclass_id,
                                       reinterpret_cast<DWORD_PTR>(button))) {
      delete button;
      napi_throw_error(env, nullptr, "Unable to attach the snap button to the window.");
      return nullptr;
    }
  }
  if (button) {
    button->bounds = rect;
    if (IsRectEmpty(&rect)) {
      SetHover(window, *button, false);
      if (button->pressed && GetCapture() == window) ReleaseCapture();
    } else {
      EnumChildWindows(window, AttachChild, reinterpret_cast<LPARAM>(window));
    }
  }
  return nullptr;
}

napi_value Initialize(napi_env env, napi_value exports) {
  napi_value setter, message;
  napi_create_function(env, "setBounds", NAPI_AUTO_LENGTH, SetBounds, nullptr, &setter);
  napi_set_named_property(env, exports, "setBounds", setter);
  napi_create_uint32(env, hover_message, &message);
  napi_set_named_property(env, exports, "hoverMessage", message);
  return exports;
}
}  // namespace

NAPI_MODULE(NODE_GYP_MODULE_NAME, Initialize)
