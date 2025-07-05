// Content script for the Table of Contents extension.
// This script is responsible for scanning the DOM, building the TOC, and injecting the sidebar.

console.log('TOC content script loaded');

let sidebarVisible = false;
let sidebar;
let intersectionObserver;
let mutationObserver;
let isResizing = false;
let startX, startWidth;
let domainRules = [];
let currentSettings = {
  headingLevels: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
  theme: 'light',
  fontSize: 16
};
let debounceTimer;

// Simple debounce function
function debounce(func, delay) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(func, delay);
}

// Check if TOC should be enabled for current domain
function isTocEnabled() {
  const currentDomain = window.location.hostname;
  console.log('Checking TOC enabled for domain:', currentDomain);
  
  // Check against domain rules
  for (const rule of domainRules) {
    // Skip empty domain rules
    if (!rule.domain) continue;
    
    if (currentDomain.includes(rule.domain) ||
        rule.domain.includes(currentDomain)) {
      console.log('Found domain rule:', rule);
      return rule.action === 'enable';
    }
  }
  
  // Default to enabled if no matching rules
  return true;
}

// Update settings from storage
function updateSettings() {
  chrome.storage.local.get({
    headingLevels: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
    theme: 'light',
    fontSize: 16,
    domainRules: []
  }, (settings) => {
    if (settings.headingLevels) currentSettings.headingLevels = settings.headingLevels;
    if (settings.theme) currentSettings.theme = settings.theme;
    if (settings.fontSize) currentSettings.fontSize = settings.fontSize;
    if (settings.domainRules) domainRules = settings.domainRules;
    
    console.log('Settings updated:', currentSettings);
    console.log('Domain rules:', domainRules);
    
    // Update UI if sidebar exists
    if (sidebar) {
      applyTheme();
      applyFontSize();
      updateToc();
    }
  });
}

// Update domain rules from storage
function updateDomainRules() {
  chrome.storage.sync.get('domainRules', (data) => {
    domainRules = data.domainRules || [];
    console.log('Domain rules updated:', domainRules);
  });
}

function generateToc() {
  // Create selector from enabled heading levels
  const selector = currentSettings.headingLevels.join(', ');
  console.log('Looking for headings with selector:', selector);
  const headers = document.querySelectorAll(selector);
  console.log('Found headers:', headers.length);
  
  if (headers.length === 0) {
    return '<div class="no-headings">No headings found on this page</div>';
  }
  
  let tocHtml = '<ul>';
  headers.forEach((header, index) => {
    const id = header.id || `toc-header-${index}`;
    header.id = id;
    const level = parseInt(header.tagName.substring(1));
    const indent = '  '.repeat(level - 1);
    tocHtml += `<li class="toc-level-${level}" style="margin-left: ${(level - 1) * 20}px;"><a href="#${id}" data-target-id="${id}" style="${level === 1 ? 'color: #007bff;' : ''}">${header.textContent}</a></li>`;
  });
  tocHtml += '</ul>';
  return tocHtml;
}

function generateMarkdownToc() {
  // Create selector from enabled heading levels
  const selector = currentSettings.headingLevels.join(', ');
  const headers = document.querySelectorAll(selector);
  
  if (headers.length === 0) {
    return '# No headings found on this page';
  }
  
  let markdown = '';
  let lastLevel = 0;
  
  headers.forEach(header => {
    const level = parseInt(header.tagName.substring(1));
    const text = header.textContent;
    const id = header.id;
    
    // Add indentation
    const indent = '  '.repeat(level - 1);
    markdown += `${indent}- [${text}](#${id})\n`;
    lastLevel = level;
  });
  
  return markdown;
}

function updateToc() {
  const tocContent = document.getElementById('toc-content');
  if (tocContent) {
    tocContent.innerHTML = generateToc();
    console.log('TOC updated');
  }
}

function applyTheme() {
  if (currentSettings.theme === 'dark') {
    sidebar.classList.add('dark-theme');
    document.getElementById('toc-theme-toggle').textContent = '☀️';
  } else {
    sidebar.classList.remove('dark-theme');
    document.getElementById('toc-theme-toggle').textContent = '🌙';
  }
}

function applyFontSize() {
  const tocContent = document.getElementById('toc-content');
  if (tocContent) {
    tocContent.style.fontSize = `${currentSettings.fontSize}px`;
  }
}

function filterToc(searchTerm) {
  const links = document.querySelectorAll('#toc-content a');
  links.forEach(link => {
    const text = link.textContent.toLowerCase();
    const parentLi = link.parentElement;
    if (text.includes(searchTerm.toLowerCase())) {
      parentLi.style.display = '';
    } else {
      parentLi.style.display = 'none';
    }
  });
}

function createSidebar() {
  console.log('Creating sidebar');
  
  // Remove existing sidebar if it exists
  const existingSidebar = document.getElementById('toc-sidebar');
  if (existingSidebar) {
    existingSidebar.remove();
  }
  
  sidebar = document.createElement('div');
  sidebar.id = 'toc-sidebar';
  sidebar.innerHTML = `
    <div class="sidebar-header">
      <h1>Table of Contents</h1>
      <div>
        <button id="toc-theme-toggle" title="Toggle Theme">🌙</button>
        <button id="toc-settings" title="Settings">⚙️</button>
        <button id="toc-copy-markdown" title="Copy as Markdown">📋</button>
        <button id="toc-close" title="Close Sidebar">×</button>
      </div>
    </div>
    <input type="text" id="toc-search" placeholder="Search...">
    <div id="toc-content"></div>
    <div class="resize-handle"></div>
  `;
  
  document.body.appendChild(sidebar);
  console.log('Sidebar added to DOM');
  
  // Apply initial settings
  applyTheme();
  applyFontSize();
  updateToc();

  document.getElementById('toc-search').addEventListener('input', (e) => {
    filterToc(e.target.value);
  });

  document.getElementById('toc-close').addEventListener('click', () => {
    sidebarVisible = false;
    sidebar.style.display = 'none';
  });

  document.getElementById('toc-theme-toggle').addEventListener('click', () => {
    currentSettings.theme = currentSettings.theme === 'light' ? 'dark' : 'light';
    applyTheme();
    // Save theme preference
    chrome.storage.sync.set({ theme: currentSettings.theme });
  });

  document.getElementById('toc-settings').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'openSettings' });
  });

  // Add copy as markdown functionality
  document.getElementById('toc-copy-markdown').addEventListener('click', () => {
    const markdown = generateMarkdownToc();
    navigator.clipboard.writeText(markdown).then(() => {
      const button = document.getElementById('toc-copy-markdown');
      const originalText = button.textContent;
      button.textContent = '✓ Copied!';
      setTimeout(() => {
        button.textContent = originalText;
      }, 2000);
    });
  });

  const tocContent = document.getElementById('toc-content');
  tocContent.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') {
      e.preventDefault();
      const targetId = e.target.getAttribute('data-target-id');
      const targetElement = document.getElementById(targetId);
      if (targetElement) {
        // Use scrollIntoView with a smooth behavior
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });

        
      }
    }
  });

  // Add resize functionality
  const resizeHandle = sidebar.querySelector('.resize-handle');
  resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = parseInt(document.defaultView.getComputedStyle(sidebar).width, 10);
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const width = startWidth + (startX - e.clientX);
    sidebar.style.width = `${width}px`;
  });

  document.addEventListener('mouseup', () => {
    isResizing = false;
  });

  setupObservers();
}

function setupObservers() {
  const selector = currentSettings.headingLevels.join(', ');
  const headers = document.querySelectorAll(selector);
  
  // Disconnect previous intersection observer if it exists
  if (intersectionObserver) {
    intersectionObserver.disconnect();
  }

  intersectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const id = entry.target.id;
      const link = document.querySelector(`#toc-content a[data-target-id="${id}"]`);
      if (link) {
        if (entry.isIntersecting) {
          link.classList.add('active');
        } else {
          link.classList.remove('active');
        }
      }
    });
  }, { rootMargin: '0px 0px 20% 0px' });

  headers.forEach(header => {
    intersectionObserver.observe(header);
  });
  
  // Disconnect previous mutation observer if it exists
  if (mutationObserver) {
    mutationObserver.disconnect();
  }

  mutationObserver = new MutationObserver((mutations) => {
    // Debounce TOC updates to prevent excessive regenerations
    debounce(() => {
      updateToc();
      setupObservers(); // Re-setup observers as headers might have changed
    }, 300);
  });

  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function toggleSidebar() {
  console.log('Toggle sidebar called');
  
  // Check if TOC is enabled for this domain
  if (!isTocEnabled()) {
    console.log('TOC disabled for this domain');
    return;
  }
  
  if (!sidebar) {
    createSidebar();
  }
  
  sidebarVisible = !sidebarVisible;
  sidebar.style.display = sidebarVisible ? 'block' : 'none';
  console.log(`Sidebar visibility: ${sidebarVisible ? 'visible' : 'hidden'}`);
}

// Wait for DOM to be ready
function init() {
  console.log('Initializing TOC extension');
  updateSettings();
  updateDomainRules();
  
  // Check if page already has headings
  const headers = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
  console.log('Initial headers found:', headers.length);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Listen for storage changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.headingLevels || changes.theme || changes.fontSize) {
    updateSettings();
  }
  if (changes.domainRules) {
    domainRules = changes.domainRules.newValue || [];
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Received message in content script:', request);
  if (request.action === 'toggleSidebar') {
    toggleSidebar();
    sendResponse({ success: true });
  }
});