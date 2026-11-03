(function () {
  var stopped = false;
  var cleanups = [];
  var limits = {
    maxCount: 64,
    maxBytesPerFile: 4 * 1024 * 1024,
    maxBytesTotal: 16 * 1024 * 1024,
    maxRequestsPerSession: 128,
  };
  var cache = Object.create(null);
  var blobUrls = Object.create(null);
  var requestCount = 0;
  var totalBytes = 0;
  var pending = Object.create(null);
  var nextId = 1;
  var extMime = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".m4a": "audio/mp4",
    ".json": "application/json",
  };

  function post(type) {
    try {
      parent.postMessage({ source: "proto-lab", type: type }, "*");
    } catch (error) {
      /* El documento puede estar ya en about:blank. */
    }
  }

  function fail(code) {
    throw new Error(code);
  }

  function normalize(raw) {
    if (typeof raw !== "string") return null;
    var path = raw.trim();
    while (path.indexOf("./") === 0) path = path.slice(2);
    if (!path || path.length > 512) return null;
    if (path.indexOf("\\") !== -1 || path.charAt(0) === "/" || /^[a-zA-Z]:/.test(path)) return null;
    if (path.indexOf(":") !== -1 || path.indexOf("//") === 0) return null;
    var segments = path.split("/");
    for (var index = 0; index < segments.length; index += 1) {
      if (!segments[index] || segments[index] === "." || segments[index] === "..") return null;
    }
    return segments.join("/");
  }

  function slugOf(pathname) {
    var match = pathname.match(/^\/protos\/([a-z0-9-]+)(\/|$)/);
    return match ? match[1] : null;
  }

  function stays(page, target) {
    var slug = slugOf(page.pathname);
    if (!slug || target.origin !== page.origin || target.search || target.hash) return false;
    var decoded = target.pathname;
    try {
      decoded = decodeURIComponent(target.pathname);
    } catch (error) {
      return false;
    }
    var prefix = "/protos/" + slug + "/";
    return decoded.indexOf(prefix) === 0 && decoded.indexOf("..") === -1 && decoded.indexOf("\\") === -1;
  }

  function resolve(raw) {
    var normalized = normalize(raw);
    if (!normalized) return null;
    var page;
    try {
      page = new URL(window.location.href);
    } catch (error) {
      return null;
    }
    var slug = slugOf(page.pathname);
    if (!slug) return null;
    var prefix = "/protos/" + slug + "/";
    var dir = page.pathname;
    if (dir === "/protos/" + slug) dir = prefix;
    else if (dir.charAt(dir.length - 1) !== "/") dir = dir.replace(/[^/]*$/, "");
    if (dir.indexOf(prefix) !== 0) return null;
    var resolved;
    try {
      resolved = new URL(normalized, page.origin + dir);
    } catch (error) {
      return null;
    }
    return stays(page, resolved) ? resolved.href : null;
  }

  function extensionOf(path) {
    var base = path.slice(path.lastIndexOf("/") + 1);
    var dot = base.lastIndexOf(".");
    return dot >= 0 ? base.slice(dot).toLowerCase() : "";
  }

  function accessPage(bytes) {
    var sample = new TextDecoder().decode(bytes.subarray(0, 2000)).toLowerCase();
    return sample.indexOf("cloudflareaccess.com") !== -1 || sample.indexOf("cloudflare access") !== -1;
  }

  function acceptedMime(header, path, bytes) {
    var mime = String(header || "").split(";")[0].trim().toLowerCase();
    var ext = extensionOf(path);
    if (mime === "text/html") return { error: "blocked" };
    if ((mime === "text/plain" || mime === "") && accessPage(bytes)) return { error: "blocked" };
    if (mime.indexOf("image/") === 0 || mime.indexOf("audio/") === 0) return { mime: mime };
    if (mime === "application/json" || mime === "text/json") return { mime: "application/json" };
    if (ext === ".json" && (mime === "text/plain" || mime === "application/octet-stream" || mime === "")) {
      try {
        JSON.parse(new TextDecoder().decode(bytes));
      } catch (error) {
        return { error: "blocked" };
      }
      return { mime: "application/json" };
    }
    if ((mime === "application/octet-stream" || mime === "") && extMime[ext] && ext !== ".json") return { mime: extMime[ext] };
    return { error: "mime" };
  }

  function load(raw) {
    if (requestCount >= limits.maxRequestsPerSession) return Promise.reject(new Error("rate-limit"));
    var href = resolve(raw);
    if (!href) return Promise.reject(new Error("not-allowed"));
    requestCount += 1;
    if (cache[href]) return Promise.resolve(cache[href]);
    if (Object.keys(cache).length >= limits.maxCount) return Promise.reject(new Error("too-many"));
    return fetch(href, { credentials: "include", redirect: "follow" })
      .catch(function () {
        fail("blocked");
      })
      .then(function (response) {
        if (!response || !response.ok) fail("blocked");
        if (response.url) {
          var page = new URL(window.location.href);
          var finalUrl = new URL(response.url);
          if (!stays(page, finalUrl)) fail("blocked");
        }
        var lengthHeader = response.headers.get("content-length");
        if (lengthHeader != null) {
          var length = parseInt(lengthHeader, 10);
          if (isFinite(length) && length > limits.maxBytesPerFile) fail("too-large");
        }
        return response.arrayBuffer().then(function (buffer) {
          if (buffer.byteLength > limits.maxBytesPerFile) fail("too-large");
          if (totalBytes + buffer.byteLength > limits.maxBytesTotal) fail("too-large");
          var classified = acceptedMime(response.headers.get("content-type") || "", href, new Uint8Array(buffer));
          if (classified.error) fail(classified.error);
          totalBytes += buffer.byteLength;
          cache[href] = { mime: classified.mime, buffer: buffer };
          return cache[href];
        });
      });
  }

  function revoke() {
    var urls = Object.keys(blobUrls);
    for (var index = 0; index < urls.length; index += 1) {
      try {
        URL.revokeObjectURL(blobUrls[urls[index]]);
      } catch (error) {
        /* La URL ya no está. */
      }
    }
    blobUrls = Object.create(null);
  }

  function requestSave(op, key, value) {
    var id = nextId;
    nextId += 1;
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        if (!pending[id]) return;
        delete pending[id];
        reject(new Error("timeout"));
      }, 8000);
      pending[id] = { resolve: resolve, reject: reject, timer: timer };
      var message = { source: "proto-lab", type: "save", id: id, op: op, key: key };
      if (op === "set") message.value = value;
      parent.postMessage(message, "*");
    });
  }

  window.addEventListener("message", function (event) {
    if (event.source !== parent) return;
    var data = event.data;
    if (!data || data.source !== "proto-lab" || data.type !== "save-result" || typeof data.id !== "number") return;
    var entry = pending[data.id];
    if (!entry) return;
    delete pending[data.id];
    clearTimeout(entry.timer);
    if (data.ok) entry.resolve(data.value == null ? null : data.value);
    else entry.reject(new Error(data.error || "invalid"));
  });

  window.__protoLabData = {
    load: load,
    json: function (path) {
      return load(path).then(function (loaded) {
        if (loaded.mime !== "application/json") fail("mime");
        try {
          return JSON.parse(new TextDecoder().decode(loaded.buffer));
        } catch (error) {
          fail("blocked");
        }
      });
    },
    blobUrl: function (path) {
      return load(path).then(function (loaded) {
        var href = resolve(path);
        if (!href) fail("not-allowed");
        if (blobUrls[href]) return blobUrls[href];
        var url = URL.createObjectURL(new Blob([loaded.buffer], { type: loaded.mime }));
        blobUrls[href] = url;
        return url;
      });
    },
    get: function (key) {
      return requestSave("get", key);
    },
    set: function (key, value) {
      return requestSave("set", key, value).then(function () {});
    },
    remove: function (key) {
      return requestSave("delete", key).then(function () {});
    },
    revoke: revoke,
  };

  window.__protoLabApp = {
    stop: function () {
      if (stopped) return;
      stopped = true;
      revoke();
      var pendingStops = cleanups.splice(0);
      for (var index = 0; index < pendingStops.length; index += 1) {
        try {
          pendingStops[index]();
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
