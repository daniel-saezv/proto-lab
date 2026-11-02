(function () {
  var stopped = false;
  var cleanups = [];

  function post(type) {
    try {
      parent.postMessage({ source: "proto-lab", type: type }, "*");
    } catch (error) {
      /* El documento puede estar ya en about:blank. */
    }
  }

  window.__protoLabApp = {
    stop: function () {
      if (stopped) return;
      stopped = true;
      var pending = cleanups.splice(0);
      for (var index = 0; index < pending.length; index += 1) {
        try {
          pending[index]();
        } catch (error) {
          /* Un gancho no debe impedir el resto. */
        }
      }
    },
    onStop: function (fn) {
      if (typeof fn === "function") cleanups.push(fn);
    },
  };

  window.__protoLabNotifyReady = function () {
    post("ready");
  };

  post("alive");
  window.addEventListener("pagehide", function () {
    window.__protoLabApp.stop();
  });
})();
