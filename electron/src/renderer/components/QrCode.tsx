import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

/** 링크 문자열로 바로 그리는 QR (파일로 저장하지 않음) */
export function QrCode({ url, className }: { url: string; className?: string }) {
  const [svg, setSvg] = useState('');

  useEffect(() => {
    QRCode.toString(url, {
      type: 'svg',
      margin: 0,
      errorCorrectionLevel: 'M',
      color: { dark: '#0e0e0d', light: '#ffffff' },
    }).then(setSvg);
  }, [url]);

  return <div className={className} dangerouslySetInnerHTML={{ __html: svg }} />;
}
