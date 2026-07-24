/**
 * AI Auto Answer - Popup
 * Simple status and quick actions
 */

const elements = {
  responseCount: document.getElementById('responseCount'),
  providerStatus: document.getElementById('providerStatus'),
  status: document.getElementById('status')
};

function showStatus(message, isError = false) {
  const el = elements.status;
  el.textContent = message;
  el.className = isError ? 'error' : 'success';
  el.style.display = 'block';

  clearTimeout(window.statusTimeout);
  window.statusTimeout = setTimeout(() => {
    el.style.display = 'none';
  }, 4000);
}

document.addEventListener('DOMContentLoaded', () => {
  loadStatus();
});

async function loadStatus() {
  try {
    const { responses = [] } = await chrome.storage.local.get('responses');
    elements.responseCount.textContent = String(responses.length);
  } catch {
    elements.responseCount.textContent = '0';
  }

  try {
    const { kiloApiKey = '' } = await chrome.storage.sync.get('kiloApiKey');
    const hasKey = kiloApiKey && kiloApiKey.length > 0;
    elements.providerStatus.textContent = hasKey ? 'Kilo AI' : 'Hardcoded';
    elements.providerStatus.className = 'metric-value badge ' + (hasKey ? 'badge-info' : 'badge-success');
  } catch {
    elements.providerStatus.textContent = 'Hardcoded';
  }
}
