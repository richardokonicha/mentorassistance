const elements = {
  responseCount: document.getElementById('responseCount'),
  providerStatus: document.getElementById('providerStatus'),
  status: document.getElementById('status')
} as const;

function showStatus(message: string, isError = false): void {
  const el = elements.status;
  if (!el) return;
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

async function loadStatus(): Promise<void> {
  try {
    const { responses = [] } = await chrome.storage.local.get('responses');
    if (elements.responseCount) {
      elements.responseCount.textContent = String(responses.length);
    }
  } catch {
    if (elements.responseCount) {
      elements.responseCount.textContent = '0';
    }
  }

  try {
    const { kiloApiKey = '' } = await chrome.storage.sync.get('kiloApiKey');
    const hasKey = typeof kiloApiKey === 'string' && kiloApiKey.length > 0;
    if (elements.providerStatus) {
      elements.providerStatus.textContent = hasKey ? 'Kilo AI' : 'Hardcoded';
      elements.providerStatus.className = 'metric-value badge ' + (hasKey ? 'badge-info' : 'badge-success');
    }
  } catch {
    if (elements.providerStatus) {
      elements.providerStatus.textContent = 'Hardcoded';
    }
  }
}
