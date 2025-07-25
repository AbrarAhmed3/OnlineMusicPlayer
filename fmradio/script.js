      // ----- Elements -----
      const allStationsTab = document.getElementById("allStationsTab");
      const favoritesTab = document.getElementById("favoritesTab");
      const stationsPanel = document.getElementById("stationsPanel");
      const favoritesPanel = document.getElementById("favoritesPanel");
      const searchInput = document.getElementById("searchInput");
      const audioPlayer = document.getElementById("audioPlayer");
      const nowPlayingName = document.getElementById("nowPlayingName");
      const nowPlayingLogo = document.getElementById("nowPlayingLogo");
      const nowPlayingTags = document.getElementById("nowPlayingTags");
      const playPauseBtn = document.getElementById("playPauseBtn");
      const playPauseIcon = document.getElementById("playPauseIcon");
      const volumeSlider = document.getElementById("volumeSlider");
      const playingIndicator = document.getElementById("playingIndicator");

      // ----- State -----
      let stations = [],
        favorites = [],
        isFavTab = false;
      let currentStation = null,
        isPlaying = false;
      const FAVORITES_KEY = "indianRadioFavs";

      // Util: channel initials
      function initials(name) {
        if (!name) return "?";
        return name
          .split(" ")
          .map((p) => p[0])
          .join("")
          .toUpperCase()
          .slice(0, 3);
      }

      // Favorites persist/load
      function saveFavorites() {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
      }
      function loadFavorites() {
        try {
          return JSON.parse(localStorage.getItem(FAVORITES_KEY)) || [];
        } catch {
          return [];
        }
      }
      favorites = loadFavorites();

      // ---- Station Card UI ----
      function stationCardHTML(station) {
        const isFavorite = favorites.some(
          (s) => s.stationuuid === station.stationuuid
        );
        let cover = "";
        if (station.favicon && station.favicon.startsWith("http")) {
          cover = `<img src="${station.favicon}" alt="${station.name}" class="h-16 w-16 rounded-lg object-cover ring-2 ring-green-500 bg-neutral-800" loading="lazy" />`;
        } else {
          cover = `<span class="h-16 w-16 rounded-lg logo-fallback">${initials(
            station.name
          )}</span>`;
        }
        return `
      <div data-uuid="${station.stationuuid}" tabindex="0"
           class="group relative flex px-3 py-4 gap-4 rounded-xl bg-neutral-900 shadow hover:scale-[1.03] focus:ring-2 ring-green-400 transition cursor-pointer overflow-hidden min-h-[110px] items-center"
           title="${station.name}">
        <div>
          ${cover}
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-base font-bold truncate" title="${station.name}">${
          station.name
        }</div>
          <div class="text-xs text-green-300 truncate mb-1">${
            station.tags || "No tags"
          }</div>
        </div>
        <button class="heart absolute right-3 top-2 z-10 ${
          isFavorite ? "fav" : ""
        } bg-transparent border-0"
            aria-label="${
              isFavorite ? "Remove from favorites" : "Add to favorites"
            }"
            data-fav="${station.stationuuid}" tabindex="0">
          <svg stroke="#e11d48" stroke-width="2" fill="${
            isFavorite ? "#e11d48" : "none"
          }" viewBox="0 0 24 24" class="w-7 h-7">
            <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0l-1.06 1.06-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
          </svg>
        </button>
      </div>
      `;
      }

      // ---- Renderers ----
      function renderStations(list) {
        if (!list.length)
          return `<div class='text-neutral-400 text-center col-span-full mt-10'>No stations found.</div>`;
        return list.map((st) => stationCardHTML(st)).join("");
      }
      function updateStationsPanel(list) {
        stationsPanel.innerHTML = renderStations(list);
        updateAllHearts();
      }
      function updateFavoritesPanel() {
        favoritesPanel.innerHTML = renderStations(favorites);
        updateAllHearts();
      }
      function updateAllHearts() {
        document.querySelectorAll(".heart").forEach((btn) => {
          const uuid = btn.getAttribute("data-fav");
          if (favorites.some((s) => s.stationuuid === uuid)) {
            btn.classList.add("fav");
            btn.setAttribute("aria-label", "Remove from favorites");
            btn.querySelector("svg").setAttribute("fill", "#e11d48");
          } else {
            btn.classList.remove("fav");
            btn.setAttribute("aria-label", "Add to favorites");
            btn.querySelector("svg").setAttribute("fill", "none");
          }
        });
      }

      // ---- Live search (debounced API) ----
      let searchDebounce;
      function fetchStations(query = "") {
        let apiURL =
          "https://de1.api.radio-browser.info/json/stations/bycountry/India?limit=50";
        if (query && query.trim().length)
          apiURL = `https://de1.api.radio-browser.info/json/stations/search?country=India&name=${encodeURIComponent(
            query.trim()
          )}&limit=50`;
        stationsPanel.innerHTML =
          '<div class="col-span-full text-neutral-400 mt-16 text-center">Loading stations...</div>';
        fetch(apiURL)
          .then((r) => r.json())
          .then((data) => {
            stations = data.filter((st) => st.url_resolved);
            updateStationsPanel(stations);
          })
          .catch(() => {
            stationsPanel.innerHTML =
              '<div class="col-span-full text-red-500 mt-20 text-center">Failed to load.</div>';
          });
      }
      searchInput.addEventListener("input", (e) => {
        clearTimeout(searchDebounce);
        const q = e.target.value;
        searchDebounce = setTimeout(() => fetchStations(q), 280);
      });

      // ---- Now playing logic ----
      function playStation(station) {
        if (!station || !station.url_resolved) return;
        currentStation = station;
        audioPlayer.src = station.url_resolved;
        audioPlayer.play();
        isPlaying = true;
        nowPlayingName.textContent = station.name;
        nowPlayingTags.textContent = `${station.country || ""}${
          station.tags ? " • " + station.tags : ""
        }`;
        // Show logo or fallback
        if (station.favicon && station.favicon.startsWith("http")) {
          nowPlayingLogo.innerHTML = `<img src="${station.favicon}" alt="" class="h-14 w-14 rounded-md object-cover"/>`;
        } else {
          nowPlayingLogo.innerHTML = `<span class="h-14 w-14 rounded-md logo-fallback logo-on-bar">${initials(
            station.name
          )}</span>`;
        }
        updatePlayIcon();
        playingIndicator.classList.remove("hidden");
      }
      function updatePlayIcon() {
        playPauseIcon.innerHTML = isPlaying
          ? `<rect x="6" y="4" width="4" height="16" rx="1" ry="1"></rect>
           <rect x="14" y="4" width="4" height="16" rx="1" ry="1"></rect>`
          : `<path d="M6 4l12 8-12 8V4z"/>`;
        playPauseBtn.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
        playingIndicator.classList.toggle("hidden", !isPlaying);
      }

      // ---- Panel navigation ----
      function showAllStationsTab() {
        allStationsTab.classList.add("active-nav");
        favoritesTab.classList.remove("active-nav");
        stationsPanel.classList.remove("hidden");
        favoritesPanel.classList.add("hidden");
        isFavTab = false;
      }
      function showFavoritesTab() {
        favoritesTab.classList.add("active-nav");
        allStationsTab.classList.remove("active-nav");
        stationsPanel.classList.add("hidden");
        favoritesPanel.classList.remove("hidden");
        isFavTab = true;
        updateFavoritesPanel();
      }
      allStationsTab.onclick = showAllStationsTab;
      favoritesTab.onclick = showFavoritesTab;

      // ---- Click events: Panel event delegation (play/fav) ----
      function handlePanelClick(panelList, getList) {
        panelList.addEventListener("click", function (e) {
          const heartBtn = e.target.closest(".heart");
          if (heartBtn) {
            const uuid = heartBtn.getAttribute("data-fav");
            const i = favorites.findIndex((s) => s.stationuuid === uuid);
            if (i === -1) {
              const inList = getList().find((s) => s.stationuuid === uuid);
              if (inList) {
                favorites.push(inList);
                saveFavorites();
              }
            } else {
              favorites.splice(i, 1);
              saveFavorites();
            }
            updateStationsPanel(stations);
            updateFavoritesPanel();
            updateAllHearts();
            e.stopPropagation();
            return;
          }
          const card = e.target.closest("[data-uuid]");
          if (card) {
            const uuid = card.getAttribute("data-uuid");
            const st = getList().find((s) => s.stationuuid === uuid);
            if (st) playStation(st);
          }
        });
      }
      handlePanelClick(stationsPanel, () => stations);
      handlePanelClick(favoritesPanel, () => favorites);

      // -- Play/pause --
      playPauseBtn.addEventListener("click", () => {
        if (!currentStation) return;
        if (isPlaying) {
          audioPlayer.pause();
        } else {
          audioPlayer.play();
        }
      });
      audioPlayer.addEventListener("playing", () => {
        isPlaying = true;
        updatePlayIcon();
      });
      audioPlayer.addEventListener("pause", () => {
        isPlaying = false;
        updatePlayIcon();
      });

      // Volume
      audioPlayer.volume = volumeSlider.value;
      volumeSlider.oninput = () => {
        audioPlayer.volume = volumeSlider.value;
      };

      // ---- Startup ----
      showAllStationsTab();
      fetchStations();
      updateFavoritesPanel();
      updateAllHearts();