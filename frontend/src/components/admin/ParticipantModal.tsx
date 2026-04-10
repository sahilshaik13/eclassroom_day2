"use client";

import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Save, User, Mail, Shield, Trash2, AlertTriangle, PauseCircle, PlayCircle } from "lucide-react";
import api from "@/services/api";
import toast from "react-hot-toast";

interface ParticipantModalProps {
    children?: React.ReactNode;
    item: any;
    type: 'teacher' | 'student';
    onSave: () => void;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function ParticipantModal({ item, type, onSave, open, onOpenChange }: ParticipantModalProps) {
    const [formData, setFormData] = useState({ ...item });
    const [loading, setLoading] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState("");

    useEffect(() => {
        setFormData({ ...item });
        setShowDeleteConfirm(false);
        setDeleteConfirmText("");
    }, [item]);

    const handleSave = async () => {
        setLoading(true);
        try {
            const endpoint = type === 'teacher' ? `/admin/teachers/${item.id}` : `/admin/students/${item.id}`;
            await api.patch(endpoint, {
                name: formData.name,
                email: formData.email,
            });
            toast.success("Profile updated successfully");
            onSave();
        } catch (error) {
            toast.error("Failed to update profile");
        } finally {
            setLoading(false);
        }
    };

    const toggleStatus = async () => {
        setLoading(true);
        try {
            const isDeactivated = !!item.deactivated_at;
            const endpoint = type === 'teacher'
                ? `/admin/teachers/${item.id}/${isDeactivated ? 'activate' : 'deactivate'}`
                : `/admin/students/${item.id}/${isDeactivated ? 'activate' : 'deactivate'}`;

            await api.post(endpoint);
            toast.success(
                isDeactivated
                    ? `${type === 'teacher' ? 'Teacher' : 'Student'} account activated`
                    : type === 'teacher'
                        ? 'Teacher marked as on leave'
                        : 'Student account disabled'
            );
            onSave();
        } catch (error) {
            toast.error("Operation failed");
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (deleteConfirmText !== item.name) return;
        setLoading(true);
        try {
            const endpoint = type === 'teacher' ? `/admin/teachers/${item.id}` : `/admin/students/${item.id}`;
            await api.delete(endpoint);
            toast.success(`${type === 'teacher' ? 'Teacher' : 'Student'} permanently deleted`);
            onOpenChange(false);
            onSave();
        } catch (error) {
            toast.error("Failed to delete account");
        } finally {
            setLoading(false);
            setShowDeleteConfirm(false);
            setDeleteConfirmText("");
        }
    };

    const isDeactivated = !!item.deactivated_at;

    return (
        <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setShowDeleteConfirm(false); setDeleteConfirmText(""); } }}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <div className="flex items-start justify-between">
                        <div>
                            <DialogTitle className="text-xl font-bold tracking-tight">
                                {type === 'teacher' ? 'Teacher Profile' : 'Student Profile'}
                            </DialogTitle>
                            <p className="text-sm text-slate-500">Manage account information and status.</p>
                        </div>
                        <Badge variant="outline" className="text-[10px] font-mono">{item.id.substring(0, 8)}</Badge>
                    </div>
                </DialogHeader>

                {!showDeleteConfirm ? (
                    <>
                        <div className="space-y-6 py-4">
                            {/* Personal Info */}
                            <div className="space-y-4">
                                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 border-b pb-2">
                                    <User className="h-4 w-4 text-primary" />
                                    Account Details
                                </h3>

                                <div className="grid gap-2">
                                    <Label htmlFor="name">Full Name</Label>
                                    <Input
                                        id="name"
                                        value={formData.name || ""}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        className="h-10"
                                    />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="email">Email Address</Label>
                                    <div className="relative">
                                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                        <Input
                                            id="email"
                                            value={formData.email || ""}
                                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                            className="pl-10 h-10"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Status Section */}
                            <div className="space-y-4">
                                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 border-b pb-2">
                                    <Shield className="h-4 w-4 text-primary" />
                                    Access Control
                                </h3>

                                {/* Disable / Enable (On Leave) */}
                                <div className={`flex items-center justify-between p-3 rounded-lg border ${isDeactivated ? 'bg-amber-50/50 border-amber-200' : 'bg-slate-50/50 border-slate-200'}`}>
                                    <div className="flex items-center gap-3">
                                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${isDeactivated ? 'bg-amber-100' : 'bg-slate-100'}`}>
                                            {isDeactivated
                                                ? <PauseCircle className="h-4 w-4 text-amber-600" />
                                                : <PlayCircle className="h-4 w-4 text-emerald-600" />
                                            }
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium">
                                                {isDeactivated
                                                    ? type === 'teacher' ? 'On Leave' : 'Disabled'
                                                    : 'Active'
                                                }
                                            </p>
                                            <p className="text-xs text-slate-500">
                                                {isDeactivated
                                                    ? type === 'teacher'
                                                        ? 'Students will see this teacher is on leave'
                                                        : 'Student cannot access the platform'
                                                    : 'User has full access to the platform'
                                                }
                                            </p>
                                        </div>
                                    </div>
                                    <Button
                                        variant={isDeactivated ? "default" : "outline"}
                                        size="sm"
                                        onClick={toggleStatus}
                                        disabled={loading}
                                        className={isDeactivated ? 'bg-emerald-600 hover:bg-emerald-700' : 'border-amber-300 text-amber-700 hover:bg-amber-50'}
                                    >
                                        {isDeactivated
                                            ? <><PlayCircle className="h-3.5 w-3.5 mr-1.5" /> Activate</>
                                            : <><PauseCircle className="h-3.5 w-3.5 mr-1.5" /> {type === 'teacher' ? 'Mark On Leave' : 'Disable'}</>
                                        }
                                    </Button>
                                </div>

                                {/* Permanent Delete */}
                                <div className="flex items-center justify-between p-3 rounded-lg border border-red-200 bg-red-50/30">
                                    <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 bg-red-100 rounded-lg flex items-center justify-center">
                                            <Trash2 className="h-4 w-4 text-red-600" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-red-900">Delete Permanently</p>
                                            <p className="text-xs text-red-600/70">This action cannot be undone</p>
                                        </div>
                                    </div>
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={() => setShowDeleteConfirm(true)}
                                        disabled={loading}
                                    >
                                        <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <DialogFooter className="gap-2 sm:gap-0">
                            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                            <Button onClick={handleSave} disabled={loading} className="px-8">
                                {loading ? "Saving..." : (
                                    <>
                                        <Save className="mr-2 h-4 w-4" />
                                        Save Changes
                                    </>
                                )}
                            </Button>
                        </DialogFooter>
                    </>
                ) : (
                    /* Delete Confirmation View */
                    <div className="py-4 space-y-5">
                        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
                            <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-bold text-red-900">Are you absolutely sure?</p>
                                <p className="text-xs text-red-700 mt-1">
                                    This will permanently delete <strong>{item.name}</strong>'s account,
                                    {type === 'teacher'
                                        ? ' unassign them from all classes, and remove their login credentials.'
                                        : ' remove all their enrollments, task completions, and login credentials.'
                                    }
                                    {' '}This action <strong>cannot be undone</strong>.
                                </p>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="delete-confirm" className="text-xs text-slate-600">
                                Type <strong className="text-red-600">{item.name}</strong> to confirm deletion
                            </Label>
                            <Input
                                id="delete-confirm"
                                value={deleteConfirmText}
                                onChange={(e) => setDeleteConfirmText(e.target.value)}
                                placeholder={item.name}
                                className="border-red-200 focus-visible:ring-red-500"
                            />
                        </div>

                        <div className="flex gap-2">
                            <Button
                                variant="ghost"
                                className="flex-1"
                                onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(""); }}
                            >
                                Go Back
                            </Button>
                            <Button
                                variant="destructive"
                                className="flex-1"
                                onClick={handleDelete}
                                disabled={loading || deleteConfirmText !== item.name}
                            >
                                {loading ? "Deleting..." : (
                                    <>
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Delete Forever
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
