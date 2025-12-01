console.log("🚀 CLEAN STABLE VERSION LOADED");

// ---------------------------------------------------------
// GLOBAL STATE
// ---------------------------------------------------------
let bookmarks = [];
let folders = ["Default"];
let editingIndex = null;
let openFolders = {}; // remembers which folders are expanded

// ---------------------------------------------------------
// LOAD EVERYTHING
// ---------------------------------------------------------
function loadAll() {
  chrome.storage.sync.get(["bookmarks", "folders", "openFolders"], res => {
    bookmarks = res.bookmarks || [];
    folders = res.folders || ["Default"];
    openFolders = res.openFolders || {};

    // Ensure all folders have a saved state
    folders.forEach(f => {
      if (openFolders[f] === undefined) {
        openFolders[f] = (f === "Default"); // Default is expanded by default
      }
    });

    chrome.storage.sync.set({ openFolders });

    renderFolders();
    populateFolderSelect();
    renderGoogleApps();
  });
}
loadAll();

function saveAll() {
  chrome.storage.sync.set({ bookmarks, folders, openFolders });
}

// ---------------------------------------------------------
// UTILS
// ---------------------------------------------------------
function favicon(url) {
  try {
    return `https://www.google.com/s2/favicons?sz=64&domain=${new URL(url).hostname}`;
  } catch {
    return "default.png";
  }
}

function groupBookmarks() {
  const map = {};
  folders.forEach(f => (map[f] = []));
  bookmarks.forEach(b => {
    const f = b.folder || "Default";
    if (!map[f]) map[f] = [];
    map[f].push(b);
  });
  return map;
}

function closeAllMenus() {
  document.querySelectorAll(".menu").forEach(m => (m.style.display = "none"));
}

document.addEventListener("click", e => {
  if (!e.target.closest(".menu") && !e.target.closest(".dots")) {
    closeAllMenus();
  }
});

// ---------------------------------------------------------
// RENDER FOLDERS + BOOKMARKS
// ---------------------------------------------------------
function renderFolders() {
  const container = document.getElementById("bookmarkGrid");
  container.innerHTML = "";

  const grouped = groupBookmarks();

  Object.keys(grouped).forEach(folder => {
    const items = grouped[folder];

    // --- Folder Header ---
    const header = document.createElement("div");
    header.className = "folder-header";
    header.innerHTML = `
      <svg class="folder-arrow" viewBox="0 0 24 24">
        <path fill="white" d="M8 5l8 7-8 7z"></path>
      </svg>

      <span class="folder-name">${folder}</span>

      <button class="delete-folder-btn" data-folder="${folder}">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M3 6h18" stroke="#ff6b6b" stroke-width="2" stroke-linecap="round"/>
          <path d="M8 6V4h8v2" stroke="#ff6b6b" stroke-width="2" stroke-linecap="round"/>
          <path d="M10 11v6" stroke="#ff6b6b" stroke-width="2" stroke-linecap="round"/>
          <path d="M14 11v6" stroke="#ff6b6b" stroke-width="2" stroke-linecap="round"/>
          <path d="M5 6l1 14h12l1-14" stroke="#ff6b6b" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
    `;

    container.appendChild(header);

    // Draggable folder drop-zone
    header.addEventListener("dragover", e => {
      e.preventDefault();
      header.classList.add("folder-drop-target");
    });

    header.addEventListener("dragleave", () => {
      header.classList.remove("folder-drop-target");
    });

    header.addEventListener("drop", e => {
      e.preventDefault();
      header.classList.remove("folder-drop-target");
      if (!dragSourceTile) return;

      const idx = parseInt(dragSourceTile.dataset.index);
      const bm = bookmarks[idx];
      bm.folder = folder;

      saveAll();
      renderFolders();
    });

    // DELETE folder
    header.querySelector(".delete-folder-btn").addEventListener("click", e => {
      e.stopPropagation();
      if (folder === "Default") return alert("Cannot delete Default folder.");

      const ok = confirm(`Delete folder "${folder}" and its bookmarks?`);
      if (!ok) return;

      deleteFolder(folder);
    });

    // RENAME folder
    header.querySelector(".folder-name").addEventListener("click", e => {
      e.stopPropagation();
      renameFolder(folder);
    });

    // --- Folder Grid (actual bookmarks) ---
    const grid = document.createElement("div");
    grid.className = "folder-grid";
    grid.dataset.folder = folder;

    // Apply saved open/closed state
    if (!openFolders[folder]) {
      grid.classList.add("collapsed");
      header.querySelector(".folder-arrow").style.transform = "rotate(-90deg)";
    }

    // Collapse toggle
    header.addEventListener("click", e => {
      if (e.target.closest(".folder-name") || e.target.closest(".delete-folder-btn")) return;

      const isCollapsed = grid.classList.toggle("collapsed");
      header.querySelector(".folder-arrow").style.transform = isCollapsed
        ? "rotate(-90deg)"
        : "rotate(0deg)";

      openFolders[folder] = !isCollapsed;
      chrome.storage.sync.set({ openFolders });
    });

    // --- Bookmark Tiles ---
    items.forEach(b => {
      const tile = document.createElement("div");
      tile.className = "tile";
      tile.draggable = true;
      tile.dataset.index = bookmarks.indexOf(b);

      tile.innerHTML = `
        <div class="icon-wrap">
          <img src="${b.icon}" width="26"
            onerror="this.onerror=null; this.src='default.png';">
        </div>

        <div class="tile-name">${b.name}</div>

        <svg class="dots" width="20" height="20" viewBox="0 0 24 24">
          <circle cx="12" cy="5" r="2"></circle>
          <circle cx="12" cy="12" r="2"></circle>
          <circle cx="12" cy="19" r="2"></circle>
        </svg>

        <div class="menu">
          <button class="menu-btn edit-btn">Edit</button>
          <button class="menu-btn delete-btn">Delete</button>
        </div>
      `;

      // Click bookmark → open URL
      tile.querySelector(".icon-wrap").addEventListener("click", () => {
        window.location.href = b.url;
      });

      // Options menu
      tile.querySelector(".dots").addEventListener("click", e => {
        e.stopPropagation();
        closeAllMenus();
        tile.querySelector(".menu").style.display = "flex";
      });

      // Edit bookmark
      tile.querySelector(".edit-btn").addEventListener("click", () => {
        editingIndex = bookmarks.indexOf(b);
        openModal(b.name, b.url, b.folder);
      });

      // Delete bookmark
      tile.querySelector(".delete-btn").addEventListener("click", () => {
        bookmarks.splice(bookmarks.indexOf(b), 1);
        saveAll();
        renderFolders();
      });

      // Drag handlers
      tile.addEventListener("dragstart", handleDragStart);
      tile.addEventListener("dragover", handleDragOver);
      tile.addEventListener("drop", handleDrop);
      tile.addEventListener("dragend", handleDragEnd);

      grid.appendChild(tile);
    });

    container.appendChild(grid);
  });
}

// ---------------------------------------------------------
// DRAG & DROP LOGIC
// ---------------------------------------------------------
let dragSourceTile = null;

function handleDragStart() {
  dragSourceTile = this;
  this.classList.add("dragging");
}

function handleDragOver(e) {
  e.preventDefault();
  const grid = this.parentElement;
  if (this === dragSourceTile) return;

  const tiles = [...grid.children];
  const a = tiles.indexOf(dragSourceTile);
  const b = tiles.indexOf(this);

  if (a < b) grid.insertBefore(dragSourceTile, this.nextSibling);
  else grid.insertBefore(dragSourceTile, this);
}

function handleDrop() {
  const folder = this.parentElement.dataset.folder;
  const tiles = [...this.parentElement.children];
  const reordered = tiles.map(t =>
    bookmarks[parseInt(t.dataset.index)]
  );

  bookmarks = [
    ...bookmarks.filter(b => b.folder !== folder),
    ...reordered
  ];

  saveAll();
  renderFolders();
}

function handleDragEnd() {
  this.classList.remove("dragging");
}

// ---------------------------------------------------------
// MODAL + ADD / EDIT BOOKMARK
// ---------------------------------------------------------
const modal = document.getElementById("modal");
const nameInput = document.getElementById("inputName");
const urlInput = document.getElementById("inputURL");
const folderSelect = document.getElementById("folderSelect");
const newFolderInput = document.getElementById("newFolderInput");
const addFolderBtn = document.getElementById("addFolderBtn");

document.getElementById("openModalBtn").addEventListener("click", () => {
  editingIndex = null;
  openModal("", "", "Default");
});

document.getElementById("cancelBtn").addEventListener("click", () => {
  modal.classList.add("hidden");
});

function openModal(name, url, folder) {
  nameInput.value = name;
  urlInput.value = url;
  newFolderInput.classList.add("hidden");
  newFolderInput.value = "";
  populateFolderSelect(folder);
  modal.classList.remove("hidden");
}

function populateFolderSelect(selected = "Default") {
  folderSelect.innerHTML = "";
  folders.forEach(f => {
    const opt = document.createElement("option");
    opt.value = f;
    opt.textContent = f;
    folderSelect.appendChild(opt);
  });
  folderSelect.value = selected;
}

addFolderBtn.addEventListener("click", () => {
  newFolderInput.classList.remove("hidden");
  newFolderInput.focus();
});

// ENTER → add folder
newFolderInput.addEventListener("keydown", e => {
  if (e.key !== "Enter") return;

  const name = newFolderInput.value.trim();
  if (!name) return;

  if (!folders.includes(name)) {
    folders.push(name);
    openFolders[name] = true; // expanded by default
    saveAll();
  }

  populateFolderSelect(name);
  renderFolders();

  newFolderInput.value = "";
  newFolderInput.classList.add("hidden");
});

// ENTER inside modal = Save bookmark
modal.addEventListener("keydown", e => {
  if (e.key === "Enter" && newFolderInput.classList.contains("hidden")) {
    e.preventDefault();
    saveBookmark();
  }
});

document.getElementById("saveBtn").addEventListener("click", saveBookmark);

function saveBookmark() {
  const name = nameInput.value.trim();
  const url = urlInput.value.trim();
  const folder = folderSelect.value;

  if (!name || !url) return;

  const entry = { name, url, folder, icon: favicon(url) };

  if (editingIndex === null) bookmarks.push(entry);
  else bookmarks[editingIndex] = entry;

  saveAll();
  renderFolders();
  modal.classList.add("hidden");
}

// ---------------------------------------------------------
// DELETE + RENAME FOLDER
// ---------------------------------------------------------
function deleteFolder(name) {
  folders = folders.filter(f => f !== name);
  delete openFolders[name];

  bookmarks = bookmarks.filter(b => b.folder !== name);

  saveAll();
  renderFolders();
  populateFolderSelect();
}

function renameFolder(oldName) {
  const newName = prompt("Rename folder:", oldName);
  if (!newName || newName.trim() === oldName) return;

  const trimmed = newName.trim();
  if (folders.includes(trimmed)) {
    alert("Already exists.");
    return;
  }

  folders = folders.map(f => (f === oldName ? trimmed : f));
  bookmarks = bookmarks.map(b =>
    b.folder === oldName ? { ...b, folder: trimmed } : b
  );

  // move open state
  openFolders[trimmed] = openFolders[oldName];
  delete openFolders[oldName];

  saveAll();
  renderFolders();
  populateFolderSelect(trimmed);
}

// ---------------------------------------------------------
// GOOGLE APPS LIST
// ---------------------------------------------------------
function renderGoogleApps() {
  const div = document.getElementById("googleApps");
  div.innerHTML = "";

  const apps = [
    { name: "Gmail", url: "https://mail.google.com" },
    { name: "Drive", url: "https://drive.google.com" },
    { name: "YouTube", url: "https://youtube.com" },
    { name: "Meet", url: "https://meet.google.com" },
    { name: "Calendar", url: "https://calendar.google.com" },
    { name: "Sheets", url: "https://sheets.google.com" },
    { name: "Gemini", url: "https://gemini.google.com" }
  ];

  apps.forEach(app => {
    const item = document.createElement("div");
    item.className = "app-item";
    item.innerHTML = `<img src="${favicon(app.url)}" width="20"><span>${app.name}</span>`;
    item.addEventListener("click", () => window.location.href = app.url);
    div.appendChild(item);
  });
}
