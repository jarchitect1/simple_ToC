// Script for the settings page.
// This script will handle user customizations and save them to chrome.storage.

document.addEventListener('DOMContentLoaded', () => {
  // Load saved settings
  chrome.storage.local.get({
    headingLevels: ['h1', 'h2', 'h3'],
    theme: 'light',
    fontSize: 16,
    domainRules: []
  }, (settings) => {
    // First uncheck all heading level checkboxes
    document.querySelectorAll('#heading-levels input[type="checkbox"]').forEach(checkbox => {
      checkbox.checked = false;
    });
    
    // Then load heading levels with debug logging
    if (settings.headingLevels) {
      console.log('Loading heading levels:', settings.headingLevels);
      settings.headingLevels.forEach(level => {
        const selector = `#heading-levels input[value="${level}"]`;
        console.log('Looking for checkbox with selector:', selector);
        const checkbox = document.querySelector(selector);
        if (checkbox) {
          checkbox.checked = true;
          console.log('Checked checkbox for:', level);
        } else {
          console.warn('Checkbox not found for:', level);
        }
      });
    }
    
    // Set theme
    if (settings.theme) {
      document.getElementById('theme-select').value = settings.theme;
    }
    
    // Set font size
    if (settings.fontSize) {
      document.getElementById('font-size').value = settings.fontSize;
      document.getElementById('font-size-value').textContent = `${settings.fontSize}px`;
    }
    
    // Set domain rules
    if (settings.domainRules) {
      const domainRulesContainer = document.getElementById('domain-rules');
      domainRulesContainer.innerHTML = '';
      
      settings.domainRules.forEach(rule => {
        addDomainRule(rule.domain, rule.action);
      });
    }
  });
  
  // Font size slider
  document.getElementById('font-size').addEventListener('input', (e) => {
    document.getElementById('font-size-value').textContent = `${e.target.value}px`;
  });
  
  // Add domain rule
  document.getElementById('add-rule').addEventListener('click', () => {
    addDomainRule('', 'enable');
  });
  
  // Save settings
  document.getElementById('save-settings').addEventListener('click', () => {
    saveSettings();
  });
});

function addDomainRule(domain = '', action = 'enable') {
  const domainRulesContainer = document.getElementById('domain-rules');
  const ruleDiv = document.createElement('div');
  ruleDiv.className = 'domain-rule';
  ruleDiv.innerHTML = `
    <input type="text" placeholder="example.com" class="domain-input" value="${domain}">
    <select class="rule-action">
      <option value="enable" ${action === 'enable' ? 'selected' : ''}>Enable TOC</option>
      <option value="disable" ${action === 'disable' ? 'selected' : ''}>Disable TOC</option>
    </select>
    <button class="remove-rule">&times;</button>
  `;
  domainRulesContainer.appendChild(ruleDiv);
  
  // Add remove rule handler
  ruleDiv.querySelector('.remove-rule').addEventListener('click', () => {
    ruleDiv.remove();
  });
}

function saveSettings() {
  // Get heading levels - fixed selector to include nested inputs
  const headingLevels = Array.from(document.querySelectorAll('#heading-levels input[type="checkbox"]:checked'))
    .map(checkbox => checkbox.value);
  
  // Get theme
  const theme = document.getElementById('theme-select').value;
  
  // Get font size
  const fontSize = document.getElementById('font-size').value;
  
  // Get domain rules
  const domainRules = Array.from(document.querySelectorAll('.domain-rule')).map(ruleDiv => {
    return {
      domain: ruleDiv.querySelector('.domain-input').value,
      action: ruleDiv.querySelector('.rule-action').value
    };
  });
  
  // Save to storage with error handling
  // Save to storage with error handling
  chrome.storage.local.set({
    headingLevels,
    theme,
    fontSize,
    domainRules
  }, () => {
    const saveButton = document.getElementById('save-settings');
    const originalText = saveButton.textContent;
    
    if (chrome.runtime.lastError) {
      console.error('Failed to save settings:', chrome.runtime.lastError);
      saveButton.textContent = 'Save Failed!';
    } else {
      // Show saved message with number of heading levels saved
      saveButton.textContent = `Saved ${headingLevels.length} heading levels!`;
    }
    
    setTimeout(() => {
      saveButton.textContent = originalText;
    }, 2000);
    
    // Debug log saved settings
    console.log('Saved settings:', {
      headingLevels,
      theme,
      fontSize,
      domainRules
    });
  });
}