

// ---------------------------------------------------------
// GLOBAL STATE
// ---------------------------------------------------------
let bookmarks = [];
let folders = ["Default"];
let editingIndex = null;
let openFolders = {};
let dragSourceTile = null;
let dragPlaceholder = null;

// ---------------------------------------------------------
// LOAD EVERYTHING
// ---------------------------------------------------------
function loadAll() {

  chrome.storage.sync.get(["bookmarks", "folders", "openFolders"], res => {

    const raw = res.bookmarks || [];

    bookmarks = raw
      .filter(b => b && typeof b === "object")
      .map(b => ({
        ...b,
        id: b.id || crypto.randomUUID()
      }));

    folders = res.folders || ["Default"];
    openFolders = res.openFolders || {};

    folders.forEach(f => {
      if (openFolders[f] === undefined) {
        openFolders[f] = f === "Default";
      }
    });

    chrome.storage.sync.set({ bookmarks, folders, openFolders });

    renderFolders();
    populateFolderSelect();
    renderGoogleApps();
  });
}
loadAll();

// ---------------------------------------------------------
// SAVE ALL
// ---------------------------------------------------------
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
// RENDER UI WITH LOGS
// ---------------------------------------------------------
function renderFolders() {

  const container = document.getElementById("bookmarkGrid");
  container.innerHTML = "";

  const grouped = groupBookmarks();

  Object.keys(grouped).forEach(folder => {

    const items = grouped[folder];

    // FOLDER HEADER
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

    // GRID
    const grid = document.createElement("div");
    grid.className = "folder-grid";
    grid.dataset.folder = folder;

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

    // ADD GRID-LEVEL DRAG LISTENERS (CRITICAL FIX)
    grid.addEventListener("dragover", handleGridDragOver);
    grid.addEventListener("drop", handleGridDrop);

    // Draggable folder header drop-zone
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

      const draggedBookmark = bookmarks.find(b => b.id === dragSourceTile.dataset.id);
      if (draggedBookmark) {
        draggedBookmark.folder = folder;
      }

      saveAll();
      renderFolders();
    });

    // TILES
    items.forEach(b => {

      const tile = document.createElement("div");
      tile.className = "tile";
      tile.draggable = true;
      tile.dataset.id = b.id;

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

      // Add DRAG LISTENERS

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
// DRAG + DROP (FIXED VERSION)
// ---------------------------------------------------------
function handleDragStart(e) {

  dragSourceTile = this;

  dragPlaceholder = document.createElement("div");
  dragPlaceholder.className = "tile-placeholder";
  dragPlaceholder.style.height = `${this.offsetHeight}px`;

  this.classList.add("dragging");
}


function handleDragOver(e) {
  e.preventDefault();

  const grid = this.parentElement;
  if (!dragPlaceholder) return;

  const rect = this.getBoundingClientRect();
  const isAfter = e.clientY > rect.top + rect.height / 2;

  // Insert placeholder instead of the real tile
  if (isAfter) {
    grid.insertBefore(dragPlaceholder, this.nextSibling);
  } else {
    grid.insertBefore(dragPlaceholder, this);
  }
}


function handleDrop(e) {
  e.preventDefault();

  if (!dragSourceTile) return;

  const grid = this.parentElement;
  const folder = grid.dataset.folder;

  // Insert dragged tile where placeholder is
  if (dragPlaceholder && dragPlaceholder.parentElement) {
    grid.insertBefore(dragSourceTile, dragPlaceholder);
  }

  // Remove placeholder
  dragPlaceholder?.remove();
  dragPlaceholder = null;

  // Update bookmark folder if moved to different folder
  const draggedBookmark = bookmarks.find(b => b.id === dragSourceTile.dataset.id);
  if (draggedBookmark) {
    draggedBookmark.folder = folder;
  }

  // Reorder bookmarks based on DOM order
  const ids = [...grid.querySelectorAll(".tile")].map(el => el.dataset.id);

  const folderItems = bookmarks.filter(b => b.folder === folder);

  const reordered = ids
    .map(id => bookmarks.find(b => b.id === id))
    .filter(Boolean);

  const others = bookmarks.filter(b => b.folder !== folder);

  bookmarks = [...others, ...reordered];

  saveAll();
  renderFolders();
}

// NEW: Handle dragover on grid (allows drop on empty space)
function handleGridDragOver(e) {
  e.preventDefault();

  if (!dragPlaceholder || !dragSourceTile) return;

  // If dragging over empty space, append placeholder to end
  const tiles = [...this.querySelectorAll(".tile:not(.dragging)")];
  if (tiles.length === 0) {
    this.appendChild(dragPlaceholder);
  }
}

// NEW: Handle drop on grid (allows drop on empty space)
function handleGridDrop(e) {
  e.preventDefault();

  if (!dragSourceTile) return;

  const grid = this;
  const folder = grid.dataset.folder;

  // Insert dragged tile where placeholder is, or at the end
  if (dragPlaceholder && dragPlaceholder.parentElement === grid) {
    grid.insertBefore(dragSourceTile, dragPlaceholder);
  } else {
    grid.appendChild(dragSourceTile);
  }

  // Remove placeholder
  dragPlaceholder?.remove();
  dragPlaceholder = null;

  // Update bookmark folder
  const draggedBookmark = bookmarks.find(b => b.id === dragSourceTile.dataset.id);
  if (draggedBookmark) {
    draggedBookmark.folder = folder;
  }

  // Reorder bookmarks based on DOM order
  const ids = [...grid.querySelectorAll(".tile")].map(el => el.dataset.id);

  const folderItems = bookmarks.filter(b => b.folder === folder);
  const reordered = ids
    .map(id => bookmarks.find(b => b.id === id))
    .filter(Boolean);

  const others = bookmarks.filter(b => b.folder !== folder);
  bookmarks = [...others, ...reordered];

  saveAll();
  renderFolders();
}


function handleDragEnd(e) {

  this.classList.remove("dragging");

  if (dragPlaceholder) {
    dragPlaceholder.remove();
    dragPlaceholder = null;
  }

  dragSourceTile = null;
}


// ---------------------------------------------------------
// POPULATE FOLDER SELECT
// ---------------------------------------------------------
function populateFolderSelect(selected = "Default") {
  
  const select = document.getElementById("folderSelect");
  if (!select) return;
  
  select.innerHTML = "";
  
  folders.forEach(folder => {
    const option = document.createElement("option");
    option.value = folder;
    option.textContent = folder;
    select.appendChild(option);
  });
  
  select.value = selected;
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
  
  // Check if user typed a new folder name
  const newFolderName = newFolderInput.value.trim();
  let folder = folderSelect.value;

  if (!name || !url) return;

  // If new folder name exists, create it and use it
  if (newFolderName && !newFolderInput.classList.contains("hidden")) {
    if (!folders.includes(newFolderName)) {
      folders.push(newFolderName);
      openFolders[newFolderName] = true;
    }
    folder = newFolderName;
  }

  const entry = { 
    name, 
    url, 
    folder, 
    icon: favicon(url),
    id: editingIndex !== null ? bookmarks[editingIndex].id : crypto.randomUUID()
  };

  if (editingIndex === null) bookmarks.push(entry);
  else bookmarks[editingIndex] = entry;

  saveAll();
  renderFolders();
  modal.classList.add("hidden");
  
  // Reset new folder input
  newFolderInput.value = "";
  newFolderInput.classList.add("hidden");
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
// GOOGLE APPS
// ---------------------------------------------------------
function renderGoogleApps() {
  
  const div = document.getElementById("googleApps");
  if (!div) return;
  
  div.innerHTML = "";

  const apps = [
    { name: "Gmail", url: "https://mail.google.com", icon: "https://www.google.com/s2/favicons?sz=64&domain=gmail.com" },
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
    const iconUrl = app.icon || favicon(app.url);
    item.innerHTML = `<img src="${iconUrl}" width="20"><span>${app.name}</span>`;
    item.addEventListener("click", () => window.location.href = app.url);
    div.appendChild(item);
  });
}
