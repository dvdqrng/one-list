'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

interface UpdateInfo {
  version: string;
  releaseDate?: string;
  releaseNotes?: string;
}

interface DownloadProgress {
  percent: number;
  transferred: number;
  total: number;
}

export function UpdateNotifier() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    // Check if we're in Electron
    if (typeof window === 'undefined' || !window.electronDB) {
      return;
    }

    // Listen for update events
    window.electronDB.onUpdateAvailable?.((info: UpdateInfo) => {
      setUpdateInfo(info);
      setUpdateAvailable(true);
    });

    window.electronDB.onDownloadProgress?.((progress: DownloadProgress) => {
      setDownloadProgress(Math.round(progress.percent));
    });

    window.electronDB.onUpdateDownloaded?.(() => {
      setDownloading(false);
      setUpdateReady(true);
    });
  }, []);

  const handleDownload = async () => {
    if (!window.electronDB?.downloadUpdate) return;

    setDownloading(true);
    try {
      await window.electronDB.downloadUpdate();
    } catch (error) {
      console.error('Failed to download update:', error);
      setDownloading(false);
    }
  };

  const handleInstall = () => {
    if (!window.electronDB?.installUpdate) return;
    window.electronDB.installUpdate();
  };

  // Don't render anything if no update is available
  if (!updateAvailable) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>
            {updateReady ? 'Update Ready!' : 'Update Available'}
          </CardTitle>
          <CardDescription>
            {updateReady
              ? 'Restart the app to install the update'
              : `Version ${updateInfo?.version} is available`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {downloading && (
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">
                Downloading update... {downloadProgress}%
              </div>
              <Progress value={downloadProgress} />
            </div>
          )}

          {!downloading && !updateReady && (
            <Button onClick={handleDownload} className="w-full">
              Download Update
            </Button>
          )}

          {updateReady && (
            <div className="space-y-2">
              <Button onClick={handleInstall} className="w-full">
                Restart and Install
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setUpdateAvailable(false)}
              >
                Install Later
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
