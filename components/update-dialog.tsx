'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertCircle, CheckCircle2, Download, RefreshCw, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

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

type UpdateStatus = 'idle' | 'checking' | 'available' | 'no-update' | 'downloading' | 'ready' | 'error';

interface UpdateDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function UpdateDialog({ open, onOpenChange }: UpdateDialogProps) {
    const [status, setStatus] = useState<UpdateStatus>('idle');
    const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);

    const resetState = useCallback(() => {
        setStatus('idle');
        setUpdateInfo(null);
        setDownloadProgress(0);
        setError(null);
    }, []);

    useEffect(() => {
        if (!open) {
            // Don't reset immediately to avoid flash during close animation
            const timer = setTimeout(resetState, 300);
            return () => clearTimeout(timer);
        }
    }, [open, resetState]);

    useEffect(() => {
        if (typeof window === 'undefined' || !window.electronDB) return;

        console.log('Attaching update event listeners');

        const unsubChecking = window.electronDB.onCheckingForUpdate?.(() => {
            console.log('Event: checking-for-update');
            setStatus('checking');
            setError(null);
        });

        const unsubAvailable = window.electronDB.onUpdateAvailable?.((info: UpdateInfo) => {
            console.log('Event: update-available', info);
            setUpdateInfo(info);
            setStatus('available');
        });

        const unsubNotAvailable = window.electronDB.onUpdateNotAvailable?.(() => {
            console.log('Event: update-not-available');
            setStatus('no-update');
        });

        const unsubProgress = window.electronDB.onDownloadProgress?.((progress: DownloadProgress) => {
            console.log('Event: download-progress', progress);
            setStatus('downloading');
            setDownloadProgress(Math.round(progress.percent));
        });

        const unsubDownloaded = window.electronDB.onUpdateDownloaded?.(() => {
            console.log('Event: update-downloaded');
            setStatus('ready');
        });

        const unsubError = window.electronDB.onUpdateError?.((err: string) => {
            console.log('Event: update-error', err);
            setError(err);
            setStatus('error');
        });

        return () => {
            console.log('Cleaning up update event listeners');
            unsubChecking?.();
            unsubAvailable?.();
            unsubNotAvailable?.();
            unsubProgress?.();
            unsubDownloaded?.();
            unsubError?.();
        };
    }, []);

    const handleCheck = async () => {
        console.log('handleCheck (UpdateDialog) button clicked');

        if (typeof window === 'undefined' || !window.electronDB) {
            console.error('electronDB is missing - are you running in a web browser?');
            setError('Update feature only available in desktop app.');
            setStatus('error');
            return;
        }

        if (!window.electronDB.checkForUpdates) {
            console.error('electronDB.checkForUpdates is missing - please restart the Electron app');
            setError('System out of sync. Please restart the app.');
            setStatus('error');
            return;
        }

        setError(null);
        setStatus('checking');
        try {
            console.log('Calling electronDB.checkForUpdates IPC...');
            await window.electronDB.checkForUpdates();
            console.log('electronDB.checkForUpdates IPC call resolved');
        } catch (err: any) {
            console.error('Update check error details:', err);
            setError(err.message || 'Failed to check for updates');
            setStatus('error');
        }
    };

    const handleDownload = async () => {
        if (!window.electronDB?.downloadUpdate) return;
        setStatus('downloading');
        try {
            await window.electronDB.downloadUpdate();
        } catch (err: any) {
            setError(err.message || 'Failed to download update');
            setStatus('error');
        }
    };

    const handleInstall = () => {
        if (!window.electronDB?.installUpdate) return;
        window.electronDB.installUpdate();
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <RefreshCw className={cn("h-5 w-5", status === 'checking' && "animate-spin")} />
                        Software Update
                    </DialogTitle>
                    <DialogDescription>
                        Manage application updates and view release details.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4">
                    <div className="rounded-lg border bg-muted/50 p-4 min-h-[120px] flex flex-col justify-center">
                        {status === 'idle' && (
                            <div className="text-center space-y-2">
                                <p className="text-sm font-medium">Ready to check for updates</p>
                                <p className="text-xs text-muted-foreground">Make sure you have an active internet connection.</p>
                            </div>
                        )}

                        {status === 'checking' && (
                            <div className="text-center space-y-3">
                                <RefreshCw className="h-8 w-8 animate-spin mx-auto text-primary" />
                                <p className="text-sm font-medium">Checking for updates...</p>
                            </div>
                        )}

                        {status === 'no-update' && (
                            <div className="text-center space-y-2">
                                <CheckCircle2 className="h-8 w-8 mx-auto text-green-500" />
                                <p className="text-sm font-medium">Up to Date</p>
                                <p className="text-xs text-muted-foreground">You are running the latest version of Notes List.</p>
                            </div>
                        )}

                        {status === 'available' && updateInfo && (
                            <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <Download className="h-5 w-5 text-primary" />
                                    <p className="text-sm font-semibold">Version {updateInfo.version} is available!</p>
                                </div>
                                {updateInfo.releaseNotes && (
                                    <ScrollArea className="h-32 rounded border bg-background p-2">
                                        <div
                                            className="text-xs space-y-1 prose prose-sm dark:prose-invert max-w-none"
                                            dangerouslySetInnerHTML={{ __html: updateInfo.releaseNotes }}
                                        />
                                    </ScrollArea>
                                )}
                            </div>
                        )}

                        {status === 'downloading' && (
                            <div className="space-y-4 w-full px-2">
                                <div className="flex justify-between text-xs font-medium">
                                    <span>Downloading update...</span>
                                    <span>{downloadProgress}%</span>
                                </div>
                                <Progress value={downloadProgress} className="h-2" />
                                <p className="text-[10px] text-center text-muted-foreground italic">
                                    This may take a moment depending on your connection.
                                </p>
                            </div>
                        )}

                        {status === 'ready' && (
                            <div className="text-center space-y-2">
                                <CheckCircle2 className="h-8 w-8 mx-auto text-green-500" />
                                <p className="text-sm font-medium">Update Ready</p>
                                <p className="text-xs text-muted-foreground">The update has been downloaded and is ready to install.</p>
                            </div>
                        )}

                        {status === 'error' && (
                            <div className="text-center space-y-2">
                                <XCircle className="h-8 w-8 mx-auto text-destructive" />
                                <p className="text-sm font-medium text-destructive">Update Error</p>
                                <p className="text-xs font-mono bg-destructive/10 p-2 rounded break-all max-h-20 overflow-auto">
                                    {error || 'An unexpected error occurred during the update process.'}
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                <DialogFooter className="sm:justify-between gap-2">
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                    >
                        Close
                    </Button>

                    <div className="flex gap-2">
                        {(status === 'idle' || status === 'no-update' || status === 'error') && (
                            <Button onClick={handleCheck}>
                                {status === 'error' ? 'Retry Check' : 'Check for Updates'}
                            </Button>
                        )}

                        {status === 'checking' && (
                            <Button disabled>
                                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                Checking...
                            </Button>
                        )}

                        {status === 'available' && (
                            <Button onClick={handleDownload}>
                                Download Now
                            </Button>
                        )}

                        {status === 'ready' && (
                            <Button onClick={handleInstall}>
                                Restart & Install
                            </Button>
                        )}
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
