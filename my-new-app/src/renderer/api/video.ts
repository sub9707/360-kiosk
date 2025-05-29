export async function saveVideoToLocal(): Promise<string | null> {
  const result = await window.electron.ipcRenderer.invoke('save-video-to-local');
  return result.success ? result.path : null;
}
