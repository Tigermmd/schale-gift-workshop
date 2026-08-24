/* Start the dashboard only from an HTTP origin.  file:// cannot fetch the
   local JSON snapshots used by the module graph, so explain the launch path
   instead of leaving the loading screen spinning forever. */
(function startSchaleDashboard() {
  const BUILD_VERSION = "dashboard-20260824-data-refresh-v113";

  function showBootError(title, message) {
    const loading = document.getElementById("loading-state");
    const error = document.getElementById("error-state");
    const errorTitle = document.getElementById("error-title");
    const errorMessage = document.getElementById("error-message");
    if (loading) loading.hidden = true;
    if (errorTitle) errorTitle.textContent = title;
    if (errorMessage) errorMessage.textContent = message;
    if (error) error.hidden = false;
  }

  function start() {
    if (location.protocol === "file:") {
      showBootError(
        "请通过本地 HTTP 服务打开页面",
        "直接打开 index.html 会被浏览器阻止读取模块和数据。请在项目目录运行：python3 harness_server.py，然后访问：http://127.0.0.1:8765/index.html?view=planner",
      );
      return;
    }

    import(`./app.js?v=${BUILD_VERSION}&ui=v113&knowledge=v3`).catch((error) => {
      console.error("Schale dashboard failed to start", error);
      showBootError("页面加载失败", "请刷新页面；如果仍然失败，请重新启动本地 harness_server.py。");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
