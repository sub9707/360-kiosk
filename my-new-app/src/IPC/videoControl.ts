import { ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import { promises as fsPromises } from 'fs';

// Get video files from directory
ipcMain.handle('get-video-files', async (_event, directory: string) => {
    try {
        const files = await fsPromises.readdir(directory);
        const videoFiles = files.map(file => ({
            name: file,
            path: path.join(directory, file),
            isVideo: file.endsWith('.mp4')
        }));
        return videoFiles;
    } catch (error) {
        console.error('Error fetching video files:', error);
        throw error;
    }
});

// Delete video file and its QR code
ipcMain.handle('delete-video', async (_event, filePath: string) => {
    try {
        // Delete QR code file if it exists
        const qrPath = filePath.replace('.mp4', '.png');
        try {
            await fsPromises.access(qrPath);
            await fsPromises.unlink(qrPath);
        } catch {
            // QR file doesn't exist, ignore
        }
        
        await fsPromises.unlink(filePath);
        return true;
    } catch (error) {
        console.error('Error deleting video:', error);
        throw error;
    }
});

// Get latest edited video
ipcMain.handle('get-latest-edited-video', async () => {
    const baseDir = 'F:/videos/original';
    try {
        const folders = fs.readdirSync(baseDir).filter((name) => {
            const fullPath = path.join(baseDir, name);
            return fs.statSync(fullPath).isDirectory();
        }).sort().reverse();

        for (const folder of folders) {
            const folderPath = path.join(baseDir, folder);
            const files = fs.readdirSync(folderPath)
                .filter(file => file.startsWith('edited_') && file.endsWith('.mp4'))
                .sort()
                .reverse();

            if (files.length > 0) {
                return path.join(folderPath, files[0]);
            }
        }

        return null;
    } catch (error) {
        console.error('Error while fetching edited video:', error);
        return null;
    }
});