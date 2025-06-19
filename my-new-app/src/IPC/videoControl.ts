import { ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import { promises as fsPromises } from 'fs';
import { exec } from 'child_process';
import { getResourcePath } from '../utils/path-utils'; // Assuming you have path-utils

// This is likely from DriveControl.ts, but moved here for central video management
const VIDEO_SAVE_BASE_DIR = 'F:\\videos\\original';

// Helper function to get ffmpeg path
const getFfmpegPath = () => getResourcePath('ffmpeg/ffmpeg.exe', 'ffmpeg.exe');

// 🆕 배경 영상용 최신 edited 비디오 찾기
ipcMain.handle('get-latest-background-video', async () => {
    try {
        console.log('🎬 [VideoControl] 배경 영상용 최신 비디오 검색 시작');
        
        // 베이스 디렉토리 존재 확인
        if (!await fsPromises.access(VIDEO_SAVE_BASE_DIR).then(() => true).catch(() => false)) {
            console.warn('⚠️ [VideoControl] 베이스 디렉토리가 존재하지 않음:', VIDEO_SAVE_BASE_DIR);
            return { success: false, useDefault: true, error: 'Base directory not found' };
        }

        // 날짜 폴더들 가져오기 (YYYYMMDD 형식만)
        const entries = await fsPromises.readdir(VIDEO_SAVE_BASE_DIR, { withFileTypes: true });
        const dateFolders = entries
            .filter(dirent => dirent.isDirectory() && /^\d{8}$/.test(dirent.name))
            .map(dirent => dirent.name)
            .sort((a, b) => b.localeCompare(a)); // 최신 날짜 순으로 정렬

        console.log('📁 [VideoControl] 발견된 날짜 폴더들:', dateFolders);

        if (dateFolders.length === 0) {
            console.warn('⚠️ [VideoControl] 날짜 폴더가 없음');
            return { success: false, useDefault: true, error: 'No date folders found' };
        }

        // 각 날짜 폴더에서 edited_ 비디오 찾기 (최신 날짜부터)
        for (const dateFolder of dateFolders) {
            const folderPath = path.join(VIDEO_SAVE_BASE_DIR, dateFolder);
            console.log(`🔍 [VideoControl] ${dateFolder} 폴더 검색 중...`);

            try {
                const files = await fsPromises.readdir(folderPath);
                
                // edited_VIDEO_*.mp4 파일들 필터링 및 정렬
                const editedVideos = files
                    .filter(file => 
                        file.startsWith('edited_VIDEO_') && 
                        file.endsWith('.mp4') &&
                        /^edited_VIDEO_\d{8}_\d{6}\.mp4$/.test(file)
                    )
                    .sort((a, b) => b.localeCompare(a)); // 최신 시간 순으로 정렬

                console.log(`📹 [VideoControl] ${dateFolder}에서 발견된 편집 영상들:`, editedVideos);

                if (editedVideos.length > 0) {
                    const latestVideo = editedVideos[0];
                    const videoPath = path.join(folderPath, latestVideo);
                    
                    // 파일 실제 존재 확인
                    const exists = await fsPromises.access(videoPath).then(() => true).catch(() => false);
                    if (exists) {
                        const stats = await fsPromises.stat(videoPath);
                        if (stats.size > 0) {
                            console.log(`✅ [VideoControl] 최신 배경 영상 발견: ${videoPath}`);
                            return { 
                                success: true, 
                                videoPath: videoPath,
                                fileName: latestVideo,
                                dateFolder: dateFolder,
                                useDefault: false
                            };
                        } else {
                            console.warn(`⚠️ [VideoControl] 파일이 비어있음: ${videoPath}`);
                        }
                    } else {
                        console.warn(`⚠️ [VideoControl] 파일이 존재하지 않음: ${videoPath}`);
                    }
                }
            } catch (folderError: any) {
                console.warn(`⚠️ [VideoControl] ${dateFolder} 폴더 읽기 오류:`, folderError.message);
                continue; // 다음 폴더로 계속
            }
        }

        console.warn('⚠️ [VideoControl] 조건에 맞는 편집 영상을 찾을 수 없음');
        return { success: false, useDefault: true, error: 'No suitable edited videos found' };

    } catch (error: any) {
        console.error('❌ [VideoControl] 배경 영상 검색 중 오류:', error);
        return { success: false, useDefault: true, error: error.message };
    }
});

// Get directory contents (folders or videos with thumbnails)
ipcMain.handle('get-directory-contents', async (_event, directoryPath: string) => {
    try {
        console.log(`[videoControl] Requesting directory contents for: ${directoryPath}`);
        const entries = await fsPromises.readdir(directoryPath, { withFileTypes: true });
        const contents: Array<{ name: string; path: string; isDirectory: boolean; thumbnail?: string }> = [];

        for (const dirent of entries) {
            const fullPath = path.join(directoryPath, dirent.name);
            if (dirent.isDirectory()) {
                // For date folders, filter by YYYYMMDD format
                if (directoryPath === VIDEO_SAVE_BASE_DIR && !/^\d{8}$/.test(dirent.name)) {
                    continue; // Skip non-date folders at the base level
                }
                contents.push({
                    name: dirent.name,
                    path: fullPath,
                    isDirectory: true,
                });
            } else if (dirent.isFile() && dirent.name.endsWith('.mp4') && dirent.name.startsWith('edited_')) {
                // For edited videos, try to get a thumbnail
                let thumbnailBase64 = '';
                try {
                    thumbnailBase64 = await new Promise((resolve, reject) => {
                        const thumbnailPath = path.join(path.dirname(fullPath), `.${dirent.name}.thumb.jpg`); // Hidden thumbnail file
                        const ffmpegCommand = `"${getFfmpegPath()}" -i "${fullPath}" -ss 00:00:01 -vframes 1 -q:v 2 "${thumbnailPath}" -y`;

                        exec(ffmpegCommand, async (error) => {
                            if (error) {
                                console.warn(`[videoControl] Could not generate thumbnail for ${dirent.name}:`, error.message);
                                resolve(''); // Resolve with empty string if thumbnail generation fails
                                return;
                            }
                            try {
                                const thumbnailData = await fsPromises.readFile(thumbnailPath, { encoding: 'base64' });
                                await fsPromises.unlink(thumbnailPath); // Clean up temp thumbnail file
                                resolve(thumbnailData);
                            } catch (readError) {
                                console.warn(`[videoControl] Could not read or delete thumbnail for ${dirent.name}:`, readError);
                                resolve('');
                            }
                        });
                    });
                } catch (thumbError) {
                    console.warn(`[videoControl] Error in thumbnail promise for ${dirent.name}:`, thumbError);
                    thumbnailBase64 = '';
                }

                contents.push({
                    name: dirent.name,
                    path: fullPath,
                    isDirectory: false,
                    thumbnail: thumbnailBase64 || undefined,
                });
            }
        }

        // Sort folders first, then files
        contents.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            // For items of the same type, sort by name (descending for date folders/video names)
            return b.name.localeCompare(a.name);
        });

        console.log(`[videoControl] Found ${contents.length} entries in ${directoryPath}`);
        return { success: true, contents };
    } catch (error: any) {
        console.error(`[videoControl] Error in get-directory-contents for ${directoryPath}:`, error);
        if (error.code === 'ENOENT') {
            return { success: true, contents: [], error: 'Directory not found.' };
        }
        return { success: false, error: error.message };
    }
});


// Delete video file and its QR code
ipcMain.handle('delete-video', async (_event, filePath: string) => {
    try {
        const parsed = path.parse(filePath);
        // QR code name is the video name WITHOUT 'edited_' prefix
        const baseNameForQr = parsed.name.startsWith('edited_') ? parsed.name.substring(7) : parsed.name;
        const qrPath = path.join(parsed.dir, `${baseNameForQr}.png`);

        try {
            await fsPromises.access(qrPath);
            await fsPromises.unlink(qrPath);
            console.log(`[videoControl] Deleted QR file: ${qrPath}`);
        } catch (qrError: any) {
            if (qrError.code === 'ENOENT') {
                console.warn(`[videoControl] QR file not found for deletion (ignored): ${qrPath}`);
            } else {
                console.error(`[videoControl] Error deleting QR file ${qrPath}:`, qrError);
            }
        }
        
        await fsPromises.unlink(filePath);
        console.log(`[videoControl] Deleted video file: ${filePath}`);
        return true;
    } catch (error) {
        console.error('Error deleting video:', error);
        throw error;
    }
});

// The following IPC handlers are no longer directly used by the modal,
// but might be used elsewhere or remain for compatibility.
// If they are exclusively for the modal, they can be removed or integrated.

// Get video files from directory (now covered by get-directory-contents)
ipcMain.handle('get-video-files', async (_event, directory: string) => {
    console.warn('[videoControl] `get-video-files` is deprecated. Use `get-directory-contents` instead.');
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

// Get latest edited video (still useful for other parts of the app)
ipcMain.handle('get-latest-edited-video', async () => {
    // ... (existing implementation)
    const baseDir = 'F:/videos/original';
    try {
        const folders = fs.readdirSync(baseDir).filter((name) => {
            const fullPath = path.join(baseDir, name);
            return fs.statSync(fullPath).isDirectory() && /^\d{8}$/.test(name);
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
        console.error('Error while fetching latest edited video:', error);
        return null;
    }
});

// Get list of date folders within VIDEO_SAVE_BASE_DIR (now covered by get-directory-contents)
ipcMain.handle('get-video-folders', async () => {
    console.warn('[videoControl] `get-video-folders` is deprecated. Use `get-directory-contents` instead.');
    const VIDEO_SAVE_BASE_DIR = 'F:\\videos\\original';
    try {
        const entries = await fsPromises.readdir(VIDEO_SAVE_BASE_DIR, { withFileTypes: true });
        const folders = entries
            .filter(dirent => dirent.isDirectory() && /^\d{8}$/.test(dirent.name))
            .map(dirent => dirent.name)
            .sort((a, b) => b.localeCompare(a));
        
        return { success: true, folders };
    } catch (error: any) {
        console.error('❌ Error fetching video folders:', error);
        if (error.code === 'ENOENT') {
            return { success: true, folders: [], error: 'Base directory not found.' };
        }
        return { success: false, error: error.message };
    }
});