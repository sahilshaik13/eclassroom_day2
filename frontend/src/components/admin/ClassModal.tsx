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
import { GraduationCap, User, Video, Plus, Loader2 } from "lucide-react";
import api from "@/services/api";
import toast from "react-hot-toast";
import { Teacher } from "@/types";

interface ClassModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
}

export function ClassModal({ open, onOpenChange, onSuccess }: ClassModalProps) {
    const [name, setName] = useState("");
    const [teacherId, setTeacherId] = useState("");
    const [zoomLink, setZoomLink] = useState("");
    const [teachers, setTeachers] = useState<Teacher[]>([]);
    const [loading, setLoading] = useState(false);
    const [fetchingTeachers, setFetchingTeachers] = useState(false);

    useEffect(() => {
        if (open) {
            setName("");
            setTeacherId("");
            setZoomLink("");
            
            setFetchingTeachers(true);
            api.get('/admin/teachers')
                .then(res => setTeachers(res.data.data))
                .catch(() => toast.error("Could not load teachers"))
                .finally(() => setFetchingTeachers(false));
        }
    }, [open]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name) return toast.error("Class name is required");
        
        setLoading(true);
        try {
            await api.post('/admin/classes', {
                name,
                teacher_id: teacherId || undefined,
                zoom_link: zoomLink || undefined,
                is_active: true
            });
            toast.success("Class created successfully");
            onSuccess();
            onOpenChange(false);
        } catch (error) {
            toast.error("Failed to create class");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <div>
                        <DialogTitle className="text-xl font-bold tracking-tight">
                            Create New Class
                        </DialogTitle>
                        <p className="text-sm text-slate-500">
                            Set up a new learning environment and assign a teacher.
                        </p>
                    </div>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-6 py-4">
                    <div className="space-y-4">
                        <div className="grid gap-2">
                            <Label htmlFor="name">Class Name</Label>
                            <div className="relative">
                                <GraduationCap className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <Input
                                    id="name"
                                    placeholder="e.g. Hifz Morning Batch A"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="pl-10 h-10"
                                    required
                                />
                            </div>
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="teacher">Assign Teacher (Optional)</Label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <select
                                    id="teacher"
                                    value={teacherId}
                                    onChange={(e) => setTeacherId(e.target.value)}
                                    disabled={fetchingTeachers}
                                    className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-10 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none"
                                >
                                    <option value="">Select a teacher</option>
                                    {teachers.map((t) => (
                                        <option key={t.id} value={t.id}>
                                            {t.name}
                                        </option>
                                    ))}
                                </select>
                                {fetchingTeachers && (
                                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 animate-spin" />
                                )}
                            </div>
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="zoom">Zoom / Meeting Link (Optional)</Label>
                            <div className="relative">
                                <Video className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <Input
                                    id="zoom"
                                    placeholder="https://zoom.us/j/..."
                                    value={zoomLink}
                                    onChange={(e) => setZoomLink(e.target.value)}
                                    className="pl-10 h-10"
                                />
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="pt-4">
                        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading} className="px-8 bg-blue-600 hover:bg-blue-700 text-white font-bold h-10 rounded-lg transition-all shadow-md active:scale-[0.98]">
                            {loading ? (
                                <span className="flex items-center gap-2">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    Creating...
                                </span>
                            ) : (
                                <>
                                    <Plus className="mr-2 h-4 w-4" />
                                    Record Class
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
