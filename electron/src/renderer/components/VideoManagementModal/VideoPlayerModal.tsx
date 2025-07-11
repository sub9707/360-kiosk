import React, { useState, useEffect, useRef } from 'react';
import styles from './VideoPlayerModal.module.scss';
import CloseIcon from '/src/renderer/assets/icons/close.svg';


interface VideoPlayerModalProps {
    isOpen: boolean;
    onClose: () => void;
    videoPath: string;
}

const VideoPlayerModal: React.FC<VideoPlayerModalProps> = ({ isOpen, onClose, videoPath }) => {
    const { ipcRenderer } = window.require("electron");
    const path = window.require("path");


    const [qrBlobUrl, setQrBlobUrl] = useState<string | null>(null);
    const [showQr, setShowQr] = useState(false); // To explicitly control QR visibility
    const [deleteAttempted, setDeleteAttempted] = useState(false); // Track if delete was attempted

    // Create a ref to store the previous isOpen value
    const prevIsOpenRef = useRef(isOpen);

    useEffect(() => {
        // Check if modal was closed and is now open
        if (!prevIsOpenRef.current && isOpen) {
            console.log('Modal just opened: Resetting QR state');
            if (qrBlobUrl) URL.revokeObjectURL(qrBlobUrl);
            setQrBlobUrl(null);
            setShowQr(false);
            setDeleteAttempted(false);
        } else if (!isOpen) { // Clean up when modal closes
            console.log('Modal just closed: Cleaning up QR URL');
            if (qrBlobUrl) URL.revokeObjectURL(qrBlobUrl);
            setQrBlobUrl(null); // Also clear the state when closed
        }

        // Update the ref for the next render
        prevIsOpenRef.current = isOpen;

    }, [isOpen, qrBlobUrl]);

    const handleDeleteVideo = async () => {
        if (!videoPath || !window.confirm('정말로 이 영상을 삭제하시겠습니까?')) {
            return;
        }
        try {
            setDeleteAttempted(true); // Indicate deletion attempt
            const result = await ipcRenderer.invoke('delete-video', videoPath);
            if (result) {
                alert('영상이 성공적으로 삭제되었습니다.');
                onClose(); // Close this modal and trigger refresh in parent
            } else {
                alert('영상 삭제에 실패했습니다.');
                setDeleteAttempted(false); // Reset if failed
            }
        } catch (error) {
            console.error('Error deleting video:', error);
            alert('영상 삭제 중 오류가 발생했습니다.');
            setDeleteAttempted(false); // Reset if failed
        }
    };

    const handleShowQr = async () => {
        if (!videoPath) {
            alert('영상을 선택해주세요.');
            return;
        }

        const parsed = path.parse(videoPath);

        // Extract the filename without extension
        let filenameWithoutExt = `${parsed.name}_qr`;

        // Construct the QR file path: same directory, modified filename, and .png extension
        const qrFilePath = path.join(parsed.dir, `${filenameWithoutExt}.png`);

        console.log("Original video path:", videoPath);
        console.log("Constructed QR path:", qrFilePath);

        try {
            const result = await ipcRenderer.invoke('get-qr-blob', qrFilePath);
            if (result.success && result.data) {

                // Revoke existing URL if any before creating a new one
                if (qrBlobUrl) URL.revokeObjectURL(qrBlobUrl);

                const blob = new Blob([new Uint8Array(result.data)], { type: 'image/png' });
                const url = URL.createObjectURL(blob);
                setQrBlobUrl(url);
                setShowQr(true);
            } else {
                console.error('Error getting QR blob:', result.error);
                alert(`QR 코드를 불러오는 데 실패했습니다: ${result.error || '파일이 없거나 오류'}`);
                setShowQr(false);
                if (qrBlobUrl) URL.revokeObjectURL(qrBlobUrl);
                setQrBlobUrl(null);
            }
        } catch (error) {
            console.error('IPC error getting QR blob:', error);
            alert('QR 코드 IPC 호출 중 오류 발생');
            setShowQr(false);
            if (qrBlobUrl) URL.revokeObjectURL(qrBlobUrl);
            setQrBlobUrl(null);
        }
    };

    if (!isOpen) return null;

    console.log("QR: ", qrBlobUrl);
    
    // 🆕 환경설정 로딩 중일 때는 기본 동작 유지 (VideoPlayerModal은 videoPath에 의존하므로 큰 영향 없음)

    return (
        <div className={styles.videoPlayerModalOverlay} onClick={onClose}>
            <div className={styles.videoPlayerModalContent} onClick={(e) => e.stopPropagation()}>
                <button className={styles.closeButton} onClick={onClose}>
                    <img src={CloseIcon} alt="Close" />
                </button>

                <video key={videoPath} controls className={styles.videoPlayer}>
                    <source src={`file://${videoPath}`} type="video/mp4" />
                    Your browser does not support the video tag.
                </video>

                <div className={styles.actions}>
                    <button onClick={handleDeleteVideo} className={styles.deleteButton} disabled={deleteAttempted}>
                        영상 삭제
                    </button>
                    <button onClick={handleShowQr} className={styles.qrButton}>
                        QR 확인
                    </button>
                </div>

                {showQr && qrBlobUrl && (
                    <div className={styles.qrOverlay} onClick={() => setShowQr(false)}>
                        <div className={styles.qrContent} onClick={(e) => e.stopPropagation()}>
                            <h3>QR 코드</h3>
                            <img src={qrBlobUrl} alt="QR Code" className={styles.qrImage} />
                            <p>클릭하여 닫기</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default VideoPlayerModal;