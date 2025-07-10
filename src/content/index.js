/**
 * Content script for the Table of Contents extension
 * Handles DOM scanning, ToC generation, and sidebar management
 */

class ToCExtension {
  constructor() {
    this.sidebarVisible = false;
    this.sidebar = null;
    this.intersectionObserver = null;
    this.mutationObserver = null;
    this.resizeState = { isResizing: false, startX: 0, startWidth: 0 };
    this.domainRules = [];
    this.debounceTimer = null;
    
    this.defaultSettings = {
      headingLevels: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
      theme: 'light',
      fontSize: 16,
      autoCollapse: false,
      showNumbers: false,
      smoothScroll: true
    };
    
    this.currentSettings = { ...this.defaultSettings };
    
    this.init();
  }

  async init() {
    console.log('TOC extension initializing...');
    await this.loadSettings();
    this.setupMessageListener();
    this.setupStorageListener();
    console.log('TOC extension initialized');
  }

  // Settings Management
  async loadSettings() {
    try {
      const settings = await chrome.storage.local.get(this.defaultSettings);
      Object.assign(this.currentSettings, settings);
      
      const domainData = await chrome.storage.local.get({ domainRules: [] });
      this.domainRules = domainData.domainRules;
      
      console.log('Settings loaded:', this.currentSettings);
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  setupStorageListener() {
    chrome.storage.onChanged.addListener((changes) => {
      let shouldUpdate = false;
      
      Object.keys(changes).forEach(key => {
        if (key in this.currentSettings) {
          this.currentSettings[key] = changes[key].newValue;
          shouldUpdate = true;
        } else if (key === 'domainRules') {
          this.domainRules = changes[key].newValue || [];
        }
      });
      
      if (shouldUpdate && this.sidebar) {
        this.updateSidebarDisplay();
      }
    });
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'toggleSidebar') {
        this.toggleSidebar();
        sendResponse({ success: true });
      }
    });
  }

  // Domain Rules
  isTocEnabled() {
    const currentDomain = window.location.hostname;
    
    for (const rule of this.domainRules) {
      if (!rule.domain) continue;
      
      if (currentDomain.includes(rule.domain) || rule.domain.includes(currentDomain)) {
        return rule.action === 'enable';
      }
    }
    
    return true; // Default to enabled
  }

  // Utility Functions
  debounce(func, delay) {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(func, delay);
  }

  // ToC Generation
  generateToc() {
    const selector = this.currentSettings.headingLevels.join(', ');
    const headers = document.querySelectorAll(selector);
    
    if (headers.length === 0) {
      return this.createNoHeadersMessage();
    }
    
    return this.buildTocHtml(headers);
  }

  createNoHeadersMessage() {
    return `
      <div class="no-headings">
        <div class="no-headings-icon">📄</div>
        <div class="no-headings-text">No headings found on this page</div>
        <div class="no-headings-hint">Try adjusting heading levels in settings</div>
      </div>
    `;
  }

  buildTocHtml(headers) {
    let tocHtml = '<ul class="toc-list">';
    let currentLevel = 1;
    let counter = 1;
    
    headers.forEach((header, index) => {
      const id = header.id || `toc-header-${index}`;
      header.id = id;
      
      const level = parseInt(header.tagName.substring(1));
      const text = this.sanitizeText(header.textContent);
      const indent = Math.max(0, (level - 1) * 20);
      
      const numberPrefix = this.currentSettings.showNumbers ? `${counter++}. ` : '';
      const levelClass = `toc-level-${level}`;
      
      tocHtml += `
        <li class="${levelClass}" style="margin-left: ${indent}px;">
          <a href="#${id}" 
             data-target-id="${id}" 
             data-level="${level}"
             title="${text}">
            ${numberPrefix}${text}
          </a>
        </li>
      `;
    });
    
    tocHtml += '</ul>';
    return tocHtml;
  }

  sanitizeText(text) {
    return text.trim().replace(/\s+/g, ' ');
  }

  generateMarkdownToc() {
    const selector = this.currentSettings.headingLevels.join(', ');
    const headers = document.querySelectorAll(selector);
    
    if (headers.length === 0) {
      return '# No headings found on this page';
    }
    
    let markdown = '# Table of Contents\n\n';
    
    headers.forEach(header => {
      const level = parseInt(header.tagName.substring(1));
      const text = this.sanitizeText(header.textContent);
      const id = header.id;
      const indent = '  '.repeat(level - 1);
      
      markdown += `${indent}- [${text}](#${id})\n`;
    });
    
    return markdown;
  }

  // Sidebar Management
  createSidebar() {
    this.removeSidebar();
    
    this.sidebar = document.createElement('div');
    this.sidebar.id = 'toc-sidebar';
    this.sidebar.innerHTML = this.getSidebarHtml();
    
    document.body.appendChild(this.sidebar);
    
    this.setupSidebarEventListeners();
    this.updateSidebarDisplay();
    this.setupObservers();
    
    console.log('Sidebar created and configured');
  }

  getSidebarHtml() {
    return `
      <div class="sidebar-header">
        <h1>Table of Contents</h1>
        <div class="sidebar-controls">
          <button id="toc-theme-toggle" title="Toggle Theme" class="control-btn">🌙</button>
          <button id="toc-settings" title="Settings" class="control-btn">⚙️</button>
          <button id="toc-copy-markdown" title="Copy as Markdown" class="control-btn">📋</button>
          <button id="toc-close" title="Close" class="control-btn close-btn">×</button>
        </div>
      </div>
      <div class="sidebar-search">
        <input type="text" id="toc-search" placeholder="Search headings..." />
        <div class="search-icon">🔍</div>
      </div>
      <div id="toc-content" class="toc-content"></div>
      <div class="resize-handle" title="Drag to resize"></div>
    `;
  }

  setupSidebarEventListeners() {
    // Search functionality
    const searchInput = document.getElementById('toc-search');
    searchInput.addEventListener('input', (e) => this.filterToc(e.target.value));
    
    // Control buttons
    document.getElementById('toc-close').addEventListener('click', () => this.hideSidebar());
    document.getElementById('toc-theme-toggle').addEventListener('click', () => this.toggleTheme());
    document.getElementById('toc-settings').addEventListener('click', () => this.openSettings());
    document.getElementById('toc-copy-markdown').addEventListener('click', () => this.copyMarkdown());
    
    // ToC navigation
    const tocContent = document.getElementById('toc-content');
    tocContent.addEventListener('click', (e) => this.handleTocClick(e));
    
    // Resize functionality
    this.setupResizeHandlers();
  }

  setupResizeHandlers() {
    const resizeHandle = this.sidebar.querySelector('.resize-handle');
    
    resizeHandle.addEventListener('mousedown', (e) => {
      this.resizeState.isResizing = true;
      this.resizeState.startX = e.clientX;
      this.resizeState.startWidth = parseInt(getComputedStyle(this.sidebar).width, 10);
      e.preventDefault();
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.resizeState.isResizing) return;
      
      const width = Math.max(250, Math.min(600, 
        this.resizeState.startWidth + (this.resizeState.startX - e.clientX)
      ));
      this.sidebar.style.width = `${width}px`;
    });

    document.addEventListener('mouseup', () => {
      if (this.resizeState.isResizing) {
        this.resizeState.isResizing = false;
        document.body.style.userSelect = '';
      }
    });
  }

  updateSidebarDisplay() {
    if (!this.sidebar) return;
    
    this.applyTheme();
    this.applyFontSize();
    this.updateTocContent();
  }

  applyTheme() {
    const themeToggle = document.getElementById('toc-theme-toggle');
    
    if (this.currentSettings.theme === 'dark') {
      this.sidebar.classList.add('dark-theme');
      themeToggle.textContent = '☀️';
    } else {
      this.sidebar.classList.remove('dark-theme');
      themeToggle.textContent = '🌙';
    }
  }

  applyFontSize() {
    const tocContent = document.getElementById('toc-content');
    if (tocContent) {
      tocContent.style.fontSize = `${this.currentSettings.fontSize}px`;
    }
  }

  updateTocContent() {
    const tocContent = document.getElementById('toc-content');
    if (tocContent) {
      tocContent.innerHTML = this.generateToc();
    }
  }

  // Event Handlers
  handleTocClick(e) {
    if (e.target.tagName !== 'A') return;
    
    e.preventDefault();
    const targetId = e.target.getAttribute('data-target-id');
    const targetElement = document.getElementById(targetId);
    
    if (targetElement) {
      this.scrollToElement(targetElement);
    }
  }

  scrollToElement(element) {
    const behavior = this.currentSettings.smoothScroll ? 'smooth' : 'auto';
    element.scrollIntoView({ behavior, block: 'start' });
  }

  filterToc(searchTerm) {
    const links = document.querySelectorAll('#toc-content a');
    const term = searchTerm.toLowerCase();
    
    links.forEach(link => {
      const text = link.textContent.toLowerCase();
      const parentLi = link.parentElement;
      parentLi.style.display = text.includes(term) ? '' : 'none';
    });
  }

  async toggleTheme() {
    this.currentSettings.theme = this.currentSettings.theme === 'light' ? 'dark' : 'light';
    this.applyTheme();
    
    try {
      await chrome.storage.local.set({ theme: this.currentSettings.theme });
    } catch (error) {
      console.error('Failed to save theme:', error);
    }
  }

  openSettings() {
    chrome.runtime.sendMessage({ action: 'openSettings' });
  }

  async copyMarkdown() {
    const markdown = this.generateMarkdownToc();
    
    try {
      await navigator.clipboard.writeText(markdown);
      this.showCopyFeedback();
    } catch (error) {
      console.error('Failed to copy markdown:', error);
    }
  }

  showCopyFeedback() {
    const button = document.getElementById('toc-copy-markdown');
    const originalText = button.textContent;
    
    button.textContent = '✓';
    button.style.color = '#28a745';
    
    setTimeout(() => {
      button.textContent = originalText;
      button.style.color = '';
    }, 1500);
  }

  // Observers
  setupObservers() {
    this.setupIntersectionObserver();
    this.setupMutationObserver();
  }

  setupIntersectionObserver() {
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }

    const selector = this.currentSettings.headingLevels.join(', ');
    const headers = document.querySelectorAll(selector);
    
    this.intersectionObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const id = entry.target.id;
        const link = document.querySelector(`#toc-content a[data-target-id="${id}"]`);
        
        if (link) {
          link.classList.toggle('active', entry.isIntersecting);
        }
      });
    }, { 
      rootMargin: '-10% 0px -80% 0px',
      threshold: 0.1
    });

    headers.forEach(header => {
      this.intersectionObserver.observe(header);
    });
  }

  setupMutationObserver() {
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
    }

    this.mutationObserver = new MutationObserver(() => {
      this.debounce(() => {
        this.updateTocContent();
        this.setupIntersectionObserver();
      }, 300);
    });

    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['id', 'class']
    });
  }

  // Public Methods
  toggleSidebar() {
    if (!this.isTocEnabled()) {
      console.log('ToC disabled for this domain');
      return;
    }
    
    if (!this.sidebar) {
      this.createSidebar();
    }
    
    this.sidebarVisible = !this.sidebarVisible;
    this.sidebar.style.display = this.sidebarVisible ? 'block' : 'none';
    
    console.log(`Sidebar ${this.sidebarVisible ? 'shown' : 'hidden'}`);
  }

  showSidebar() {
    if (!this.sidebar) {
      this.createSidebar();
    }
    
    this.sidebarVisible = true;
    this.sidebar.style.display = 'block';
  }

  hideSidebar() {
    this.sidebarVisible = false;
    if (this.sidebar) {
      this.sidebar.style.display = 'none';
    }
  }

  removeSidebar() {
    const existingSidebar = document.getElementById('toc-sidebar');
    if (existingSidebar) {
      existingSidebar.remove();
    }
    
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }
    
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
    }
  }

  destroy() {
    this.removeSidebar();
    clearTimeout(this.debounceTimer);
  }
}

// Initialize the extension when DOM is ready
function initializeExtension() {
  if (window.tocExtension) {
    window.tocExtension.destroy();
  }
  
  window.tocExtension = new ToCExtension();
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
  initializeExtension();
}