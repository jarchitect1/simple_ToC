/**
 * Background script for the Table of Contents extension
 * Handles extension state management and inter-script communication
 */

class BackgroundService {
  constructor() {
    this.init();
  }

  init() {
    this.setupMessageListeners();
    this.setupActionListener();
    this.setupInstallListener();
  }

  setupMessageListeners() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true; // Keep message channel open for async response
    });
  }

  setupActionListener() {
    chrome.action.onClicked.addListener((tab) => {
      this.toggleSidebar(tab);
    });
  }

  setupInstallListener() {
    chrome.runtime.onInstalled.addListener((details) => {
      if (details.reason === 'install') {
        this.setDefaultSettings();
      }
    });
  }

  async handleMessage(request, sender, sendResponse) {
    try {
      switch (request.action) {
        case 'toggleSidebar':
          await this.handleToggleSidebar();
          break;
        case 'openSettings':
          await this.openSettings();
          break;
        default:
          console.warn('Unknown action:', request.action);
      }
      sendResponse({ success: true });
    } catch (error) {
      console.error('Error handling message:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async handleToggleSidebar() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length === 0) return;
    
    await this.toggleSidebar(tabs[0]);
  }

  async toggleSidebar(tab) {
    const maxRetries = 3;
    let retryCount = 0;

    const attemptToggle = async () => {
      try {
        await chrome.tabs.sendMessage(tab.id, { action: 'toggleSidebar' });
      } catch (error) {
        if (retryCount < maxRetries) {
          retryCount++;
          setTimeout(attemptToggle, 200 * retryCount);
        } else {
          await this.showErrorMessage(tab.id);
        }
      }
    };

    await attemptToggle();
  }

  async showErrorMessage(tabId) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        function: this.injectErrorMessage,
      });
    } catch (error) {
      console.error('Failed to inject error message:', error);
    }
  }

  injectErrorMessage() {
    const errorMessageId = 'toc-error-message';
    let errorMessage = document.getElementById(errorMessageId);
    
    if (!errorMessage) {
      errorMessage = document.createElement('div');
      errorMessage.id = errorMessageId;
      errorMessage.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #ff6b6b, #ee5a52);
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 14px;
        font-weight: 500;
        animation: slideIn 0.3s ease-out;
      `;
      
      // Add animation keyframes
      if (!document.getElementById('toc-error-styles')) {
        const style = document.createElement('style');
        style.id = 'toc-error-styles';
        style.textContent = `
          @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
        `;
        document.head.appendChild(style);
      }
      
      document.body.appendChild(errorMessage);
    }
    
    errorMessage.textContent = 'Unable to create Table of Contents';
    
    setTimeout(() => {
      if (errorMessage && errorMessage.parentNode) {
        errorMessage.style.animation = 'slideIn 0.3s ease-out reverse';
        setTimeout(() => errorMessage.remove(), 300);
      }
    }, 3000);
  }

  async openSettings() {
    await chrome.tabs.create({ 
      url: chrome.runtime.getURL('src/settings/settings.html') 
    });
  }

  async setDefaultSettings() {
    const defaultSettings = {
      headingLevels: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
      theme: 'light',
      fontSize: 16,
      domainRules: [],
      autoCollapse: false,
      showNumbers: false,
      smoothScroll: true
    };

    await chrome.storage.local.set(defaultSettings);
  }
}

// Initialize the background service
new BackgroundService();