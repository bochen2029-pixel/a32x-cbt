// A32X.exe: opens the flyable simulator, the page beside this program, in Microsoft Edge as an app
// window, or in the default browser when there is no Edge. GPLv3.
//
//   A32X.exe               the simulator: web\index.html, beside this program
//   A32X.exe --trainer     the systems trainer it carries: trainer\index.html
//   A32X.exe --print-url   print the page's file URL, then how it would be opened, and exit having
//                          started nothing; a missing page is said on stderr. For the release gate.
//
// Nothing is installed and nothing needs an administrator. The page fetches nothing: the launcher only
// finds it and hands its file URL to a browser. A missing page is said in a message box, never by
// opening nothing (CLAUDE.md, 9). Edge ships with Windows 10 and 11, and its --app switch opens a window
// without tabs or an address bar. No WebView2: its SDK and loader need a provenance check of their own.
//
// Built with the static CRT, it needs only what every Windows has: KERNEL32, USER32, SHELL32, ADVAPI32
// and OLE32.

#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <objbase.h>
#include <shellapi.h>

#include <string>
#include <string_view>

namespace {

enum Exit : int { kOk = 0, kNoBrowser = 1, kNoPage = 2, kUsage = 64 };

constexpr wchar_t kTitle[] = L"A32X";
constexpr wchar_t kUsageText[] =
    L"A32X.exe               the flight simulator: web\\index.html, beside A32X.exe\n"
    L"A32X.exe --trainer     the systems trainer: trainer\\index.html\n"
    L"A32X.exe --print-url   print the page's URL and how it would be opened; start nothing";

// UTF-16 to UTF-8. An unpaired surrogate becomes U+FFFD, as it does in a URL.
std::string utf8(std::wstring_view w) {
  if (w.empty()) return {};
  const int n = WideCharToMultiByte(CP_UTF8, 0, w.data(), static_cast<int>(w.size()), nullptr, 0, nullptr, nullptr);
  std::string s(static_cast<size_t>(n), '\0');
  WideCharToMultiByte(CP_UTF8, 0, w.data(), static_cast<int>(w.size()), s.data(), n, nullptr, nullptr);
  return s;
}

// Text to stdout or stderr: UTF-8 into a pipe or a file, UTF-16 onto a console. A program built for
// windows has no console of its own; started from one with nothing redirected, it borrows its parent's.
void write(DWORD which, std::wstring_view text) {
  HANDLE h = GetStdHandle(which);
  if (h == nullptr || h == INVALID_HANDLE_VALUE) {
    if (!AttachConsole(ATTACH_PARENT_PROCESS) && GetLastError() != ERROR_ACCESS_DENIED) return;
    h = CreateFileW(L"CONOUT$", GENERIC_WRITE, FILE_SHARE_WRITE, nullptr, OPEN_EXISTING, 0, nullptr);
    if (h == INVALID_HANDLE_VALUE) return;
  }
  DWORD done = 0;
  if (GetFileType(h) == FILE_TYPE_CHAR &&
      WriteConsoleW(h, text.data(), static_cast<DWORD>(text.size()), &done, nullptr)) {
    return;
  }
  const std::string bytes = utf8(text);
  WriteFile(h, bytes.data(), static_cast<DWORD>(bytes.size()), &done, nullptr);
}

// This program's full path, however long it is.
std::wstring modulePath() {
  std::wstring path(MAX_PATH, L'\0');
  for (;;) {
    const DWORD n = GetModuleFileNameW(nullptr, path.data(), static_cast<DWORD>(path.size()));
    if (n == 0) return {};
    if (n < path.size()) {
      path.resize(n);
      return path;
    }
    if (path.size() >= 65536) return {};
    path.resize(path.size() * 2);  // cut short: again, with room
  }
}

// A path Windows accepts at any length: past MAX_PATH it needs the \\?\ prefix.
std::wstring extended(const std::wstring& path) {
  if (path.size() < MAX_PATH || path.rfind(L"\\\\?\\", 0) == 0) return path;
  if (path.rfind(L"\\\\", 0) == 0) return L"\\\\?\\UNC\\" + path.substr(2);
  return L"\\\\?\\" + path;
}

bool isFile(const std::wstring& path) {
  const DWORD a = GetFileAttributesW(extended(path).c_str());
  return a != INVALID_FILE_ATTRIBUTES && !(a & FILE_ATTRIBUTE_DIRECTORY);
}

// The path with any 8.3 short names spelled out, as Explorer shows it; the path itself if that fails.
std::wstring longPath(const std::wstring& path) {
  DWORD n = GetLongPathNameW(path.c_str(), nullptr, 0);
  if (n == 0) return path;
  std::wstring out(n, L'\0');
  n = GetLongPathNameW(path.c_str(), out.data(), n);
  if (n == 0 || n >= out.size()) return path;
  out.resize(n);
  return out;
}

constexpr bool keptInUrl(unsigned char c) {
  return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') ||
         std::string_view("-._!$&'()+,;=@:").find(static_cast<char>(c)) != std::string_view::npos;
}

// The file: URL of a full Windows path, spelled as Node's url.pathToFileURL spells it, which the release
// gate compares it with: ASCII letters, digits and -._!$&'()+,;=@ stay as they are, a backslash becomes
// a slash, and every other byte of the path's UTF-8 is percent-encoded, so the URL holds no space, quote,
// '#' or '?' to cut it short. \\server\share\x becomes file://server/share/x, and the \\?\ prefix of a
// long path is dropped.
std::wstring fileUrl(std::wstring path) {
  if (path.rfind(L"\\\\?\\UNC\\", 0) == 0) {
    path = L"\\\\" + path.substr(8);
  } else if (path.rfind(L"\\\\?\\", 0) == 0) {
    path = path.substr(4);
  }
  std::wstring url = L"file://";
  if (path.rfind(L"\\\\", 0) == 0) {  // a share: the server is the URL's host, in lower case
    size_t end = path.find(L'\\', 2);
    if (end == std::wstring::npos) end = path.size();
    for (size_t i = 2; i < end; ++i) {
      const wchar_t c = path[i];
      url += (c >= L'A' && c <= L'Z') ? static_cast<wchar_t>(c - L'A' + L'a') : c;
    }
    path.erase(0, end);
  } else {
    url += L'/';
  }
  constexpr char kHex[] = "0123456789ABCDEF";
  for (const unsigned char c : utf8(path)) {
    if (c == '\\' || c == '/') {
      url += L'/';
    } else if (keptInUrl(c)) {
      url += static_cast<wchar_t>(c);
    } else {
      url += L'%';
      url += static_cast<wchar_t>(kHex[c >> 4]);
      url += static_cast<wchar_t>(kHex[c & 15]);
    }
  }
  return url;
}

std::wstring environment(const wchar_t* name) {
  const DWORD n = GetEnvironmentVariableW(name, nullptr, 0);
  if (n == 0) return {};
  std::wstring value(n, L'\0');
  const DWORD got = GetEnvironmentVariableW(name, value.data(), n);
  if (got == 0 || got >= n) return {};
  value.resize(got);
  return value;
}

// msedge.exe: where Windows' App Paths say it is, per user or per machine, in either registry view;
// else where Edge installs itself.
std::wstring findEdge() {
  constexpr wchar_t kKey[] = L"SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\msedge.exe";
  for (const HKEY root : {HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE}) {
    for (const DWORD view : {static_cast<DWORD>(RRF_SUBKEY_WOW6464KEY), static_cast<DWORD>(RRF_SUBKEY_WOW6432KEY)}) {
      DWORD size = 0;
      if (RegGetValueW(root, kKey, nullptr, RRF_RT_REG_SZ | view, nullptr, nullptr, &size) != ERROR_SUCCESS || size < 2) {
        continue;
      }
      std::wstring value(size / sizeof(wchar_t), L'\0');
      if (RegGetValueW(root, kKey, nullptr, RRF_RT_REG_SZ | view, nullptr, value.data(), &size) != ERROR_SUCCESS) {
        continue;
      }
      value.resize(wcsnlen(value.c_str(), value.size()));
      if (value.size() >= 2 && value.front() == L'"' && value.back() == L'"') value = value.substr(1, value.size() - 2);
      if (isFile(value)) return value;
    }
  }
  for (const wchar_t* base : {L"ProgramFiles(x86)", L"ProgramFiles", L"LOCALAPPDATA"}) {
    const std::wstring dir = environment(base);
    if (dir.empty()) continue;
    const std::wstring edge = dir + L"\\Microsoft\\Edge\\Application\\msedge.exe";
    if (isFile(edge)) return edge;
  }
  return {};
}

// The URL needs no quotes: it holds no space and no quote, every one of them percent-encoded.
std::wstring edgeCommand(const std::wstring& edge, const std::wstring& url) {
  return L"\"" + edge + L"\" --app=" + url;
}

bool openInEdge(const std::wstring& edge, const std::wstring& url) {
  std::wstring command = edgeCommand(edge, url);
  STARTUPINFOW si{};
  si.cb = sizeof si;
  PROCESS_INFORMATION pi{};
  if (!CreateProcessW(edge.c_str(), command.data(), nullptr, nullptr, FALSE, 0, nullptr, nullptr, &si, &pi)) {
    return false;
  }
  CloseHandle(pi.hThread);
  CloseHandle(pi.hProcess);
  return true;
}

// The page through its file association, which is the default browser's.
bool openInDefaultBrowser(const std::wstring& page) {
  // ShellExecute may hand the work to a COM handler, which needs COM started on this thread.
  const HRESULT com = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE);
  const auto r = reinterpret_cast<INT_PTR>(ShellExecuteW(nullptr, L"open", page.c_str(), nullptr, nullptr, SW_SHOWNORMAL));
  if (SUCCEEDED(com)) CoUninitialize();
  return r > 32;
}

}  // namespace

int APIENTRY wWinMain(HINSTANCE, HINSTANCE, LPWSTR, int) {
  int argc = 0;
  LPWSTR* argv = CommandLineToArgvW(GetCommandLineW(), &argc);
  bool print = false, trainer = false, help = false;
  std::wstring unknown;
  for (int i = 1; argv != nullptr && i < argc; ++i) {
    const std::wstring_view a = argv[i];
    if (a == L"--print-url") {
      print = true;
    } else if (a == L"--trainer") {
      trainer = true;
    } else if (a == L"--help" || a == L"-h" || a == L"/?") {
      help = true;
    } else if (unknown.empty()) {
      unknown = a;
    }
  }
  if (argv != nullptr) LocalFree(argv);

  // Under --print-url everything goes to stdout and stderr, so that a test never meets a window.
  const auto say = [print](const std::wstring& text, bool error) {
    if (print) {
      write(error ? STD_ERROR_HANDLE : STD_OUTPUT_HANDLE, text + L"\n");
    } else {
      MessageBoxW(nullptr, text.c_str(), kTitle, MB_OK | (error ? MB_ICONERROR : MB_ICONINFORMATION));
    }
  };
  if (help) {
    say(kUsageText, false);
    return kOk;
  }
  if (!unknown.empty()) {
    say(L"A32X does not know the option \"" + unknown + L"\".\n\n" + kUsageText, true);
    return kUsage;
  }

  const std::wstring self = modulePath();
  const size_t slash = self.find_last_of(L'\\');
  if (slash == std::wstring::npos) {
    say(L"A32X could not find the folder it runs from.", true);
    return kNoPage;
  }
  std::wstring page = self.substr(0, slash) + (trainer ? L"\\trainer\\index.html" : L"\\web\\index.html");
  if (!isFile(page)) {
    say(L"A32X could not find its page:\n\n" + page +
            L"\n\nUnzip the whole folder and start A32X.exe from inside it: the page has to be beside it.",
        true);
    return kNoPage;
  }
  page = longPath(page);
  const std::wstring url = fileUrl(page);
  const std::wstring edge = findEdge();

  if (print) {
    write(STD_OUTPUT_HANDLE, url + L"\n" + (edge.empty() ? L"default browser: " + page : edgeCommand(edge, url)) + L"\n");
    return kOk;
  }
  if (!edge.empty() && openInEdge(edge, url)) return kOk;
  if (openInDefaultBrowser(page)) return kOk;
  say(L"A32X found its page but could not start a browser to show it:\n\n" + page +
          L"\n\nOpen that file in Microsoft Edge or Google Chrome.",
      true);
  return kNoBrowser;
}
