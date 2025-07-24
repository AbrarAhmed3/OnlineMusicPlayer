
      // --- IndexedDB for folder persistence ---
      async function openDB() {
        return new Promise((res, rej) => {
          const req = indexedDB.open("musicPlayerDB", 1);
          req.onupgradeneeded = () => req.result.createObjectStore("settings");
          req.onsuccess = () => res(req.result);
          req.onerror = () => rej(req.error);
        });
      }
      async function dbGet(k) {
        const db = await openDB();
        return new Promise((res) => {
          const tx = db
            .transaction("settings", "readonly")
            .objectStore("settings")
            .get(k);
          tx.onsuccess = () => res(tx.result);
        });
      }
      async function dbSet(k, v) {
        const db = await openDB();
        return new Promise((res) => {
          const tx = db
            .transaction("settings", "readwrite")
            .objectStore("settings")
            .put(v, k);
          tx.oncomplete = () => res();
        });
      }

      // --- DOM refs ---
      const dirBtn = document.getElementById("dirBtn");
      const filesBtn = document.getElementById("filesBtn");
      const fallbackPicker = document.getElementById("fallbackPicker");
      const lastFolder = document.getElementById("lastFolder");
      const playlistEl = document.getElementById("playlist");
      const audio = document.getElementById("audio");
      const playBtn = document.getElementById("playBtn");
      const prevBtn = document.getElementById("prevBtn");
      const shuffleBtn = document.getElementById("shuffleBtn");
      const nextBtn = document.getElementById("nextBtn");
      const seekBar = document.getElementById("seekBar");
      const currentTimeEl = document.getElementById("currentTime");
      const durationEl = document.getElementById("duration");
      const trackTitle = document.getElementById("trackTitle");
      const coverArt = document.getElementById("coverArt");
      const defaultArt = document.getElementById("defaultArt");

      // --- State ---
      let dirHandle = null,
        tracks = [],
        currentIndex = 0,
        isShuffle = false;

      // --- Folder picker availability ---
      if (!window.showDirectoryPicker) {
        filesBtn.classList.remove("hidden");
        dirBtn.classList.add("hidden");
      }

      // --- Restore last folder on load ---
      (async () => {
        if (window.showDirectoryPicker) {
          const h = await dbGet("dirHandle");
          if (h) {
            dirHandle = h;
            lastFolder.textContent = h.name;
            await loadTracks();
          }
        }
      })();

      // --- Folder select handler ---
      if (window.showDirectoryPicker) {
        dirBtn.addEventListener("click", async () => {
          try {
            dirHandle = await window.showDirectoryPicker();
            lastFolder.textContent = dirHandle.name;
            await dbSet("dirHandle", dirHandle);
            await loadTracks();
          } catch {}
        });
      }

      // --- Files select handler (fallback) ---
      filesBtn.addEventListener("click", () => {
        fallbackPicker.click();
      });

      fallbackPicker.addEventListener("change", async (e) => {
        const files = Array.from(e.target.files).filter((f) =>
          f.type.startsWith("audio/")
        );
        if (!files.length) return;
        dirHandle = null;
        lastFolder.textContent = "Selected files";
        tracks = await Promise.all(
          files.map(async (f) => {
            let cover = null;
            try {
              await new Promise((res) => {
                window.jsmediatags.read(f, {
                  onSuccess: ({ tags }) => {
                    if (tags.picture) {
                      const { data, format } = tags.picture;
                      cover = URL.createObjectURL(
                        new Blob([new Uint8Array(data)], { type: format })
                      );
                    }
                    res();
                  },
                  onError: () => res(),
                });
              });
            } catch {}
            return { title: f.name, url: URL.createObjectURL(f), cover };
          })
        );
        populatePlaylist();
        enableControls();
        loadTrack(0);
        autoPlay();
      });

      // --- Load all tracks from folder ---
      async function loadTracks() {
        tracks = [];
        playlistEl.innerHTML = "";
        for await (const entry of dirHandle.values()) {
          if (entry.kind === "file" && /\.(mp3|wav)$/i.test(entry.name)) {
            const file = await entry.getFile();
            let url = URL.createObjectURL(file),
              cover = null;
            try {
              await new Promise((res) => {
                window.jsmediatags.read(file, {
                  onSuccess: ({ tags }) => {
                    if (tags.picture) {
                      const { data, format } = tags.picture;
                      cover = URL.createObjectURL(
                        new Blob([new Uint8Array(data)], { type: format })
                      );
                    }
                    res();
                  },
                  onError: () => res(),
                });
              });
            } catch {}
            tracks.push({ title: entry.name, url, cover });
          }
        }
        populatePlaylist();
        enableControls();
        if (tracks.length > 0) {
          loadTrack(0);
          autoPlay();
        }
      }

      // --- Build playlist UI ---
      function populatePlaylist() {
        playlistEl.innerHTML = "";
        tracks.forEach((t, i) => {
          const li = document.createElement("li");
          li.textContent = t.title;
          li.title = t.title;
          li.className =
  "cursor-pointer hover:bg-blue-900 hover:text-white select-none rounded px-3 py-2 mb-1 transition whitespace-nowrap overflow-hidden text-ellipsis max-w-full";
          if (i === currentIndex)
            li.classList.add("bg-blue-800", "text-white", "font-semibold");
          li.onclick = () => {
            loadTrack(i);
            autoPlay();
          };
          playlistEl.appendChild(li);
        });
      }

      // --- Enable all controls ---
      function enableControls() {
        [playBtn, prevBtn, shuffleBtn, nextBtn, seekBar].forEach(
          (el) => (el.disabled = false)
        );
      }

      // --- Load a given track ---
      function loadTrack(i) {
        if (!tracks.length) return;
        currentIndex = i;
        const t = tracks[i];
        audio.src = t.url;
        trackTitle.textContent = t.title;
        trackTitle.classList.add("truncate");
        if (t.cover) {
          coverArt.src = t.cover;
          coverArt.classList.remove("hidden");
          defaultArt.classList.add("hidden");
        } else {
          // fallback: iTunes search for art
          coverArt.classList.add("hidden");
          defaultArt.classList.remove("hidden");
          fetch(
            "https://itunes.apple.com/search?term=" +
              encodeURIComponent(t.title) +
              "&limit=1&entity=song"
          )
            .then((r) => r.json())
            .then((d) => {
              if (d.results?.[0]?.artworkUrl100) {
                coverArt.src = d.results[0].artworkUrl100.replace(
                  "100x100",
                  "600x600"
                );
                coverArt.classList.remove("hidden");
                defaultArt.classList.add("hidden");
              }
            })
            .catch(() => {});
        }
        highlightActive();
        resetProgress();
        playBtn.innerHTML = '<i class="fa fa-pause"></i>';
      }

      // --- Reset progress/time UI ---
      function resetProgress() {
        audio.currentTime = 0;
        seekBar.value = 0;
        currentTimeEl.textContent = "00:00";
        durationEl.textContent = "00:00";
      }

      // --- Play the current song ---
      function autoPlay() {
        audio.play().catch(() => {});
      }

      // --- Highlight current song in playlist ---
      function highlightActive() {
        [...playlistEl.children].forEach((li, i) =>
          li.classList.toggle("bg-blue-800", i === currentIndex)
        );
        [...playlistEl.children].forEach((li, i) =>
          li.classList.toggle("text-white", i === currentIndex)
        );
        [...playlistEl.children].forEach((li, i) =>
          li.classList.toggle("font-semibold", i === currentIndex)
        );
      }

      // --- Controls logic ---
  // Toggle visual highlight when active
shuffleBtn.onclick = () => {
  isShuffle = !isShuffle;

  if (isShuffle) {
    shuffleBtn.classList.add("bg-green-500", "text-white", "shadow-md");
    shuffleBtn.classList.remove("text-gray-400");
    shuffleBtn.title = "Shuffle: ON";
  } else {
    shuffleBtn.classList.remove("bg-green-500", "text-white", "shadow-md");
    shuffleBtn.classList.add("text-gray-400");
    shuffleBtn.title = "Shuffle: OFF";
  }
};


      prevBtn.onclick = () => {
        const i = (currentIndex - 1 + tracks.length) % tracks.length;
        loadTrack(i);
        autoPlay();
      };
      nextBtn.onclick = () => {
        const i = isShuffle
          ? Math.floor(Math.random() * tracks.length)
          : (currentIndex + 1) % tracks.length;
        loadTrack(i);
        autoPlay();
      };
      playBtn.onclick = () => {
        if (audio.paused) {
          audio.play();
          playBtn.innerHTML = '<i class="fa fa-pause"></i>';
        } else {
          audio.pause();
          playBtn.innerHTML = '<i class="fa fa-play"></i>';
        }
      };

      // --- Update seek/time ---
      audio.ontimeupdate = () => {
        if (audio.duration) {
          seekBar.value = (audio.currentTime / audio.duration) * 100;
          currentTimeEl.textContent = formatTime(audio.currentTime);
        }
      };
      audio.onloadedmetadata = () =>
        (durationEl.textContent = formatTime(audio.duration));
      audio.onended = () => {
        const i = isShuffle
          ? Math.floor(Math.random() * tracks.length)
          : (currentIndex + 1) % tracks.length;
        loadTrack(i);
        autoPlay();
      };
      seekBar.oninput = () => {
        if (audio.duration)
          audio.currentTime = (seekBar.value / 100) * audio.duration;
      };

      function formatTime(s) {
        const m = String(Math.floor(s / 60)).padStart(2, "0");
        const sec = String(Math.floor(s % 60)).padStart(2, "0");
        return `${m}:${sec}`;
      }