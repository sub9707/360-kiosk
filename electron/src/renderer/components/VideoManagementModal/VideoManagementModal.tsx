// src/renderer/components/VideoManagementModal/VideoManagementModal.tsx
import React, { useState, useEffect, useCallback } from 'react';
import styles from './VideoManagementModal.module.scss';
import CloseIcon from '/src/renderer/assets/icons/close.svg';
import FolderIcon from '/src/renderer/assets/icons/file_folder.svg'; // New folder icon
import BackIcon from '/src/renderer/assets/icons/back.svg'; // Back icon
import VideoPlayerModal from './VideoPlayerModal';
// 🆕 환경설정 훅 import
import { useEnvConfig } from '../../hooks/useEnvConfig';

interface VideoManagementModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface DirectoryEntry {
    name: string;
    path: string;
    isDirectory: boolean;
    thumbnail?: string;
}

const VideoManagementModal: React.FC<VideoManagementModalProps> = ({ isOpen, onClose }) => {
    const { ipcRenderer } = window.require("electron");
    
    // 🔄 환경설정 훅 사용으로 변경
    const { config, loading: configLoading } = useEnvConfig();
    
    // 🔄 BASE_VIDEO_DIR을 state로 관리
    const [baseVideoDir, setBaseVideoDir] = useState<string>('');
    const [currentPath, setCurrentPath] = useState<string>('');
    const [entries, setEntries] = useState<DirectoryEntry[]>([]);
    const [playingVideoPath, setPlayingVideoPath] = useState<string | null>(null); // For VideoPlayerModal

    // 🆕 환경설정이 로드되면 baseVideoDir 설정
    useEffect(() => {
        if (config && config.baseDirectory) {
            setBaseVideoDir(config.baseDirectory);
            // 처음 열릴 때만 currentPath 설정
            if (!currentPath || currentPath === '') {
                setCurrentPath(config.baseDirectory);
            }
        }
    }, [config]);

    // Function to fetch directory contents (folders or videos with thumbnails)
    const fetchDirectoryContents = useCallback(async (path: string) => {
        if (!path) return; // path가 없으면 실행하지 않음
        
        try {
            const result = await ipcRenderer.invoke('get-directory-contents', path);
            if (result.success) {
                setEntries(result.contents);
            } else {
                console.error('Error fetching directory contents:', result.error);
                alert('목록을 불러오는 데 실패했습니다: ' + result.error);
            }
        } catch (error) {
            console.error('IPC error fetching directory contents:', error);
            alert('목록 IPC 호출 중 오류 발생');
        }
    }, [ipcRenderer]);

    useEffect(() => {
        if (isOpen && baseVideoDir) {
            setCurrentPath(baseVideoDir); // Reset path when modal opens
            fetchDirectoryContents(baseVideoDir);
        } else if (!isOpen) {
            // Reset states when modal closes
            setCurrentPath('');
            setEntries([]);
            setPlayingVideoPath(null);
        }
    }, [isOpen, baseVideoDir, fetchDirectoryContents]);

    useEffect(() => {
        if (isOpen && currentPath) { // Only fetch when modal is open and path is set
            fetchDirectoryContents(currentPath);
        }
    }, [currentPath, fetchDirectoryContents, isOpen]);

    const handleEntryClick = (entry: DirectoryEntry) => {
        if (entry.isDirectory) {
            setCurrentPath(entry.path);
        } else {
            // It's a video file, open the VideoPlayerModal
            setPlayingVideoPath(entry.path);
        }
    };

    const handleBackClick = () => {
        if (currentPath === baseVideoDir) {
            return; // Cannot go back from the base directory
        }
        const parentPath = window.require('path').dirname(currentPath);
        setCurrentPath(parentPath);
    };

    const handleVideoPlayerModalClose = () => {
        setPlayingVideoPath(null);
        // After closing video player, refresh the current folder list in case of deletion
        fetchDirectoryContents(currentPath);
    };

    // Helper to get display name for files
    const getFileNameDisplay = (name: string) => {
        if (name.startsWith('edited_') && name.endsWith('.mp4')) {
            return name.substring(7); // Remove 'edited_' prefix
        }
        return name;
    };

    // Format current path for display
    const displayPath = baseVideoDir ? currentPath.replace(baseVideoDir, '').replace(/\\/g, '/') : '';
    const finalDisplayPath = displayPath === '' ? '/' : displayPath;

    if (!isOpen) return null;

    // 🆕 환경설정 로딩 중일 때 로딩 표시
    if (configLoading || !baseVideoDir) {
        return (
            <div className={styles.modalOverlay}>
                <div className={styles.modalContent}>
                    <button className={styles.closeButton} onClick={onClose}>
                        <img src={CloseIcon} alt="Close" />
                    </button>
                    <h2>영상 관리</h2>
                    <div className={styles.fileExplorer}>
                        <p className={styles.emptyMessage}>설정을 불러오는 중...</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent}>
                <button className={styles.closeButton} onClick={onClose}>
                    <img src={CloseIcon} alt="Close" />
                </button>
                <h2>영상 관리</h2>

                <div className={styles.menuBar}>
                    {currentPath !== baseVideoDir && (
                        <button className={styles.backButton} onClick={handleBackClick}>
                            <img src={BackIcon} alt="Back" /> 뒤로
                        </button>
                    )}
                    <span className={styles.currentPath}>현재 위치: {finalDisplayPath}</span>
                </div>

                <div className={styles.fileExplorer}>
                    {entries.length === 0 ? (
                        <p className={styles.emptyMessage}>
                            {currentPath === baseVideoDir ? '폴더가 없습니다.' : '이 폴더에 영상이 없습니다.'}
                        </p>
                    ) : (
                        <div className={styles.gridContainer}>
                            {entries.map(entry => (
                                <div key={entry.path} className={styles.gridItem} onClick={() => handleEntryClick(entry)}>
                                    {entry.isDirectory ? (
                                        <img src={FolderIcon} alt="Folder" className={styles.icon} />
                                    ) : (
                                        entry.thumbnail ? (
                                            <img src={`data:image/jpeg;base64,${entry.thumbnail}`} alt="Video Thumbnail" className={styles.thumbnail} />
                                        ) : (
                                            <div className={styles.placeholderThumbnail}>
                                                <span>No Preview</span>
                                            </div>
                                        )
                                    )}
                                    <span className={styles.itemName}>{getFileNameDisplay(entry.name)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {playingVideoPath && (
                <VideoPlayerModal
                    isOpen={!!playingVideoPath}
                    onClose={handleVideoPlayerModalClose}
                    videoPath={playingVideoPath}
                />
            )}
        </div>
    );
};

export default VideoManagementModal;