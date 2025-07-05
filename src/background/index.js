// Background script for the Table of Contents extension.
// This script is responsible for managing the extension's state and handling events.

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'toggleSidebar') {
    // When the popup button is clicked, get the current tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) return;
      
      const tab = tabs[0];
      const maxRetries = 3;
      let retryCount = 0;
      
      const trySendMessage = () => {
        chrome.tabs.sendMessage(tab.id, { action: 'toggleSidebar' }, (response) => {
          if (chrome.runtime.lastError) {
            if (retryCount < maxRetries) {
              retryCount++;
              setTimeout(trySendMessage, 200 * retryCount);
            } else {
              console.warn('Failed to send message after retries:', chrome.runtime.lastError.message);
              // Inject a script to display the error message
              chrome.scripting.executeScript({
                target: { tabId: tab.id },
                function: () => {
                  const errorMessageId = 'toc-error-message';
                  let errorMessage = document.getElementById(errorMessageId);
                  if (!errorMessage) {
                    errorMessage = document.createElement('div');
                    errorMessage.id = errorMessageId;
                    errorMessage.style.cssText = `
                      position: fixed;
                      top: 20px;
                      right: 20px;
                      background-color: #ffcccc;
                      color: #cc0000;
                      padding: 10px;
                      border-radius: 5px;
                      border: 1px solid #cc0000;
                      z-index: 10000;
                      font-family: sans-serif;
                      font-size: 14px;
                    `;
                    document.body.appendChild(errorMessage);
                  }
                  errorMessage.textContent = 'Unable to create TOC';
                  setTimeout(() => {
                    if (errorMessage) errorMessage.remove();
                  }, 3000);
                },
              });
            }
          }
        });
      };
      
      trySendMessage();
    });
  } else if (request.action === 'openSettings') {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/settings/settings.html') });
  }
});

// Listen for clicks on the extension icon
chrome.action.onClicked.addListener((tab) => {
  const maxRetries = 3;
  let retryCount = 0;
  
  const trySendMessage = () => {
    chrome.tabs.sendMessage(tab.id, { action: 'toggleSidebar' }, (response) => {
      if (chrome.runtime.lastError) {
        if (retryCount < maxRetries) {
          retryCount++;
          setTimeout(trySendMessage, 200 * retryCount);
        } else {
          console.warn('Failed to send message after retries:', chrome.runtime.lastError.message);
          // Inject a script to display the error message
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: () => {
              const errorMessageId = 'toc-error-message';
              let errorMessage = document.getElementById(errorMessageId);
              if (!errorMessage) {
                errorMessage = document.createElement('div');
                errorMessage.id = errorMessageId;
                errorMessage.style.cssText = `
                  position: fixed;
                  top: 20px;
                  right: 20px;
                  background-color: #ffcccc;
                  color: #cc0000;
                  padding: 10px;
                  border-radius: 5px;
                  border: 1px solid #cc0000;
                  z-index: 10000;
                  font-family: sans-serif;
                  font-size: 14px;
                `;
                document.body.appendChild(errorMessage);
              }
              errorMessage.textContent = 'Unable to create TOC';
              setTimeout(() => {
                if (errorMessage) errorMessage.remove();
              }, 3000);
            },
          });
        }
      }
    });
  };
  
  trySendMessage();
});