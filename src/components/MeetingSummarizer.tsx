
"use client";

import { useState, useEffect, useRef } from "react";
import type { SummaryItem, Reminder, Note } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { summarizeMeetingTranscript } from "@/ai/flows/summarize-meeting";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { FileText, Save, Bell, Calendar as CalendarIcon, Trash2, Loader2, Send, Upload, Link as LinkIcon, User, LogOut, FileSignature, PlusCircle, Clock, AlertTriangle, Pencil, X, CheckCircle2, Circle } from "lucide-react";
import { format, parse } from "date-fns";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";


interface MeetingSummarizerProps {
  user: SupabaseUser;
}

const WEBHOOK_URL = process.env.NEXT_PUBLIC_WEBHOOK_URL!;

const SummaryRenderer = ({ content }: { content: string }) => {
  if (!content) return null;

  const lines = content.split('\n').filter(line => line.trim() !== '');

  const renderLine = (line: string, index: number) => {
    const boldHeadingMatch = line.match(/^\s*\*\*(.*?):\s*\*\*|([A-Za-z\s&]+:)$/);
    if (boldHeadingMatch) {
      const heading = (boldHeadingMatch[1] || boldHeadingMatch[2]).replace(/:$/, '');
      return <p key={index} className="text-md font-semibold mt-3 mb-1">{heading}:</p>;
    }
  
    const listItemMatch = line.match(/^(\s*[-*]\s+)(.*)/);
    if (listItemMatch) {
      const itemContent = listItemMatch[2];
      const boldContentMatch = itemContent.match(/\*\*(.*?)\*\*/);
      if (boldContentMatch) {
        const parts = itemContent.split(boldContentMatch[0]);
        return (
          <li key={index} className="text-sm ml-5 list-disc">
            {parts[0]}<span className="font-semibold">{boldContentMatch[1]}</span>{parts[1]}
          </li>
        );
      }
      return <li key={index} className="text-sm ml-5 list-disc">{itemContent}</li>;
    }
    
    return <p key={index} className="text-sm mb-1">{line}</p>;
  };
  
  return <div className="prose prose-sm dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-headings:my-2 font-sans whitespace-pre-wrap">{lines.map(renderLine)}</div>;
};

const parseSummaryText = (summaryText: string) => {
    const extractSection = (startPhrase: string, endPhrase: string | null, text: string): string[] => {
        const startRegex = new RegExp(`(?:\\*\\*)?${startPhrase}(?:\\*\\*)?:\\n?`, 'i');
        
        const startIndexMatch = text.match(startRegex);
        if (!startIndexMatch) return [];
        
        const contentStartIndex = startIndexMatch.index! + startIndexMatch[0].length;
        let content = text.substring(contentStartIndex);
        
        if (endPhrase) {
            const endRegex = new RegExp(`\\b${endPhrase}\\b`, 'i');
            const endIndexMatch = content.match(endRegex);
            if (endIndexMatch) {
                content = content.substring(0, endIndexMatch.index);
            }
        }
        
        return content
            .trim()
            .split(/\n\s*[-*]\s*/)
            .map(item => item.replace(/^-|^\*/, '').trim())
            .filter(Boolean);
    };

    const titleMatch = summaryText.match(/^\s*(?:Meeting Title|Title):\s*(.*)/im);
    const title = titleMatch && titleMatch[1] ? titleMatch[1].trim() : `Meeting Summary - ${new Date().toLocaleDateString()}`;

    const keyPoints = extractSection("Key Discussion Points", "Decisions Made", summaryText);
    const decisions = extractSection("Decisions Made", "Action Items", summaryText);
    const actionItems = extractSection("Action Items", "Follow-up", summaryText);

    return {
        title: title,
        participants: extractSection("Participants", "Key Discussion Points", summaryText),
        keyPoints,
        decisions,
        actionItems,
    };
};


export default function MeetingSummarizer({ user }: MeetingSummarizerProps) {
  const { toast } = useToast();
  const router = useRouter();
  const supabase = createClient();
  const [transcript, setTranscript] = useState("");
  const [summary, setSummary] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("summarizer");
  const [summaries, setSummaries] = useState<SummaryItem[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [newReminderText, setNewReminderText] = useState("");
  const [newReminderDate, setNewReminderDate] = useState<Date | undefined>(new Date());
  const [newReminderTime, setNewReminderTime] = useState("09:00");
  const [selectedSummaries, setSelectedSummaries] = useState<string[]>([]);
  const [selectedNotes, setSelectedNotes] = useState<string[]>([]);
  const [selectedReminders, setSelectedReminders] = useState<string[]>([]);
  const [openAccordion, setOpenAccordion] = useState<string | null>(null);
  const accordionRef = useRef<Record<string, HTMLDivElement | null>>({});
  const timeInputRef = useRef<HTMLInputElement>(null);
  const [expandedNotes, setExpandedNotes] = useState<string[]>([]);
  const [editingReminderId, setEditingReminderId] = useState<string | null>(null);
  const [editingReminderText, setEditingReminderText] = useState("");

  const [deleteConfirmation, setDeleteConfirmation] = useState<{ isOpen: boolean; summaryIds: string[] }>({ isOpen: false, summaryIds: [] });


  const [newNote, setNewNote] = useState({
    title: "",
    key_discussions: "",
    decisions_made: "",
  });

  const userName = user.user_metadata?.full_name || user.email || "User";
  const userInitials = (userName[0] || "?").toUpperCase();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  const fetchData = async () => {
    try {
      const [summariesRes, remindersRes, notesRes] = await Promise.all([
        supabase.from('summaries').select('*').eq('user_id', user.id).order('timestamp', { ascending: false }),
        supabase.from('reminders').select('*').eq('user_id', user.id).order('remindAt', { ascending: true }),
        supabase.from('notes').select('*').eq('user_id', user.id).order('timestamp', { ascending: false })
      ]);

      if (summariesRes.error) throw summariesRes.error;
      if (remindersRes.error) throw remindersRes.error;
      if (notesRes.error) throw notesRes.error;
      
      setSummaries(summariesRes.data as any[]);
      setReminders(remindersRes.data as Reminder[]);
      setNotes(notesRes.data as any[]); 

    } catch (error: any) {
      toast({ variant: "destructive", title: "Error fetching data", description: error.message });
    }
  };

  useEffect(() => {
    fetchData();
  }, [user.id]);

  useEffect(() => {
    if (openAccordion && accordionRef.current[openAccordion]) {
      accordionRef.current[openAccordion]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [openAccordion]);

  const handleSummarize = async () => {
    if (!transcript.trim()) {
      toast({ variant: 'destructive', title: 'Error', description: 'Transcript cannot be empty.' });
      return;
    }
    setIsLoading(true);
    setSummary('');
    try {
      const result = await summarizeMeetingTranscript({
        transcript,
        webhookUrl: WEBHOOK_URL,
      });
      setSummary(result.summary);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Summarization Failed', description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSummary = async () => {
    if (!summary) {
        toast({ variant: 'destructive', title: 'Error', description: 'No summary to save.' });
        return;
    }
    setIsSaving(true);
    try {
        const { data: summaryData, error: summaryError } = await supabase
            .from('summaries')
            .insert({ user_id: user.id, transcript, summary })
            .select()
            .single();

        if (summaryError) throw summaryError;
        if (!summaryData) throw new Error("Failed to get summary data back after insert.");
        
        const parsedData = parseSummaryText(summary);

        const { error: noteError } = await supabase
            .from('notes')
            .insert({
                user_id: user.id,
                summary_id: summaryData.id,
                title: parsedData.title,
                key_discussions: parsedData.keyPoints,
                decisions_made: parsedData.decisions,
            });

        if (noteError) throw noteError;

        if (parsedData.actionItems && parsedData.actionItems.length > 0) {
            const remindersToInsert = parsedData.actionItems.map(item => {
                const dueDateMatch = item.match(/due:\s*(.*?)(?:\)|$)/i);
                let remindAt: Date | null = null;
                if (dueDateMatch && dueDateMatch[1]) {
                    try {
                        const parsedDate = parse(dueDateMatch[1].trim(), 'MMMM d, yyyy', new Date());
                        if (!isNaN(parsedDate.getTime())) {
                            remindAt = parsedDate;
                        }
                    } catch (e) {
                         console.error("Could not parse date from action item:", e);
                    }
                }

                return {
                    user_id: user.id,
                    "summaryId": summaryData.id,
                    text: item,
                    "remindAt": remindAt ? remindAt.toISOString() : new Date().toISOString(),
                    completed: false,
                };
            });
            const { error: reminderError } = await supabase.from('reminders').insert(remindersToInsert);
            if (reminderError) throw reminderError;
        }
        
        toast({ title: 'Success', description: 'Summary, notes, and reminders saved!' });
        await fetchData();
        setTranscript("");
        setSummary("");
        setActiveTab("notes");

    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Save Failed', description: error.message });
    } finally {
        setIsSaving(false);
    }
  };

  const handleConfirmDelete = async (deleteLinkedData: boolean) => {
    const summaryIds = deleteConfirmation.summaryIds;
    setIsSaving(true);
    try {
        if (deleteLinkedData) {
            // Full deletion: The database cascade will handle deleting linked notes/reminders.
            await supabase.from('summaries').delete().in('id', summaryIds);
            toast({ title: "Deletion successful", description: "Summary and all linked data have been deleted." });
        } else {
            // Summary Only: Unlink notes and reminders first to prevent cascade delete.
            await supabase.from('notes').update({ summary_id: null }).in('summary_id', summaryIds);
            await supabase.from('reminders').update({ summaryId: null }).in('summaryId', summaryIds);
            await supabase.from('summaries').delete().in('id', summaryIds);
            toast({ title: "Deletion successful", description: "Summary deleted. Notes and reminders have been kept." });
        }

        setSelectedSummaries([]);
        await fetchData();
    } catch (error: any) {
        toast({ variant: "destructive", title: "Deletion failed", description: error.message });
    } finally {
        setDeleteConfirmation({ isOpen: false, summaryIds: [] });
        setIsSaving(false);
    }
  };


  const handleToggleReminder = async (id: string, completed: boolean) => {
    const originalReminders = [...reminders];
    const newStatus = !completed;

    // Optimistically update the UI
    setReminders(prevReminders => 
      prevReminders.map(r => r.id === id ? { ...r, completed: newStatus } : r)
    );

    try {
      const { error } = await supabase.from('reminders').update({ completed: newStatus }).eq('id', id);
      if (error) throw error;
    } catch (error: any) {
      // Revert the UI if the update fails
      setReminders(originalReminders);
      toast({ variant: "destructive", title: "Update failed", description: "Could not update reminder status. Please try again." });
    }
  };

    const handleUpdateReminder = async () => {
    if (!editingReminderId || !editingReminderText.trim()) {
      toast({ variant: "destructive", title: "Cannot save empty reminder." });
      return;
    }
    try {
      await supabase.from('reminders').update({ text: editingReminderText }).eq('id', editingReminderId);
      toast({ title: "Reminder updated!" });
      setEditingReminderId(null);
      setEditingReminderText("");
      await fetchData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Update failed", description: error.message });
    }
  };
  
  const handleSaveNewReminder = async () => {
    if (!newReminderText) {
      toast({ variant: "destructive", title: "Reminder text cannot be empty." });
      return;
    }
    
    const [hours, minutes] = newReminderTime.split(':').map(Number);
    const reminderDateTime = new Date(newReminderDate || new Date());
    reminderDateTime.setHours(hours, minutes);

    try {
      await supabase.from('reminders').insert({
        user_id: user.id,
        text: newReminderText,
        "remindAt": reminderDateTime.toISOString(),
        completed: false,
        "summaryId": null
      });
      toast({ title: "Reminder saved!" });
      setNewReminderText("");
      await fetchData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Failed to save reminder", description: error.message });
    }
  };

  const handleSaveNewNote = async () => {
    if (!newNote.title.trim()) {
        toast({ variant: "destructive", title: "Title cannot be empty."});
        return;
    }
    try {
        await supabase.from('notes').insert({
            user_id: user.id,
            summary_id: null,
            title: newNote.title,
            key_discussions: newNote.key_discussions ? newNote.key_discussions.split('\n').filter(Boolean) : [],
            decisions_made: newNote.decisions_made ? newNote.decisions_made.split('\n').filter(Boolean) : [],
        }).select();
        
        toast({ title: "Note saved successfully!" });
        setNewNote({ title: "", key_discussions: "", decisions_made: "" });
        await fetchData();
        setActiveTab("notes");

    } catch (error: any) {
        toast({ variant: "destructive", title: "Error Saving Note", description: error.message });
    }
  };

  const handleReminderLinkClick = (summaryId: string) => {
    setActiveTab("summaries");
    setTimeout(() => {
        setOpenAccordion(summaryId);
    }, 100);
  };
  
  const handleSelectAllSummaries = (checked: boolean) => {
    if (checked) {
      setSelectedSummaries(summaries.map(s => s.id));
    } else {
      setSelectedSummaries([]);
    }
  };

  const handleSelectAllNotes = (checked: boolean) => {
    if (checked) {
      setSelectedNotes(notes.map(n => n.id));
    } else {
      setSelectedNotes([]);
    }
  };

  const handleSelectAllReminders = (checked: boolean) => {
    if (checked) {
      setSelectedReminders(reminders.map(r => r.id));
    } else {
      setSelectedReminders([]);
    }
  };

  const handleDeleteSummaries = async () => {
    const summaryIdsToDelete = [...selectedSummaries];
    if (summaryIdsToDelete.length === 0) {
      toast({ variant: "destructive", title: "No summaries selected" });
      return;
    }

    const summariesToDelete = summaries.filter(s => summaryIdsToDelete.includes(s.id));
    
    setIsSaving(true);
    for (const summary of summariesToDelete) {
        try {
            const webhookUrl = "https://adapted-mentally-chimp.ngrok-free.app/webhook-test/email-delete-summary";
            await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    summary: summary.summary,
                    userName: userName,
                    userEmail: user.email,
                }),
            });
        } catch (error: any) {
            console.error("Failed to send deletion webhook for summary:", summary.id, error);
            toast({
                variant: "destructive",
                title: "Webhook Failed",
                description: `Could not notify for deletion of summary: ${summary.id}.`
            });
        }
    }
    setIsSaving(false);

    setDeleteConfirmation({ isOpen: true, summaryIds: summaryIdsToDelete });
  };


  const handleDeleteNotes = async () => {
    if (selectedNotes.length === 0) {
        toast({ variant: "destructive", title: "No notes selected" });
        return;
    }
    try {
        await supabase.from('notes').delete().in('id', selectedNotes);
        
        toast({ title: "Notes deleted" });
        setSelectedNotes([]);
        await fetchData();
    } catch (error: any) {
        toast({ variant: "destructive", title: "Deletion failed", description: error.message });
    }
  };

  const handleDeleteReminders = async () => {
    if (selectedReminders.length === 0) {
        toast({ variant: "destructive", title: "No reminders selected" });
        return;
    }
    try {
        await supabase.from('reminders').delete().in('id', selectedReminders);
        
        toast({ title: "Reminders deleted" });
        setSelectedReminders([]);
        await fetchData();
    } catch (error: any) {
        toast({ variant: "destructive", title: "Deletion failed", description: error.message });
    }
  };

  const getNoteForSummary = (summaryId: string) => {
    return notes.find(n => n.summary_id === summaryId);
  };

  const toggleNoteExpansion = (noteId: string) => {
    setExpandedNotes(prev => 
      prev.includes(noteId)
        ? prev.filter(id => id !== noteId)
        : [...prev, noteId]
    );
  };

  return (
    <div className="flex flex-col h-screen bg-background text-foreground font-body">
      <header className="flex items-center justify-between p-4 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <FileText className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold">Meeting Summarizer Pro</h1>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative w-10 h-10 rounded-full">
              <Avatar className="w-9 h-9">
                <AvatarFallback>{userInitials}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{userName}</p>
                <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <main className="flex-1 overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <div className="shrink-0 border-b border-border">
            <TabsList className="grid w-full grid-cols-4 h-auto rounded-none p-0 bg-transparent">
                {['summarizer', 'summaries', 'notes', 'reminders'].map(tab => (
                     <TabsTrigger key={tab} value={tab} className="capitalize relative rounded-none border-b-2 border-transparent bg-transparent p-4 font-semibold text-muted-foreground shadow-none transition-none focus-visible:ring-0 data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none">
                        {tab === 'summarizer' && <FileSignature className="mr-2"/>}
                        {tab === 'summaries' && <Save className="mr-2"/>}
                        {tab === 'notes' && <FileSignature className="mr-2" />}
                        {tab === 'reminders' && <Bell className="mr-2"/>}
                        {tab}
                     </TabsTrigger>
                ))}
            </TabsList>
          </div>
          
          <TabsContent value="summarizer" className="flex-1 overflow-y-auto p-6 bg-muted/20">
             <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="col-span-1 lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="flex items-center"><Upload className="mr-2"/> Upload Transcript</CardTitle>
                    <CardDescription>Paste your meeting transcript below to generate a summary.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      value={transcript}
                      onChange={(e) => setTranscript(e.target.value)}
                      placeholder="Paste your meeting transcript here..."
                      className="min-h-[200px] text-sm"
                    />
                  </CardContent>
                  <CardFooter className="flex justify-end gap-2">
                    <Button onClick={handleSummarize} disabled={isLoading || !transcript.trim()}>
                      {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {!isLoading && <Send className="mr-2 h-4 w-4" />}
                      Generate Summary
                    </Button>
                    <Button variant="secondary" onClick={handleSaveSummary} disabled={isSaving || !summary}>
                      {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {!isSaving && <Save className="mr-2 h-4 w-4" />}
                      Save
                    </Button>
                  </CardFooter>
                </Card>

                <Card className="col-span-1 lg:col-span-2">
                    <CardHeader>
                        <CardTitle>Generated Summary</CardTitle>
                        <CardDescription>Review the AI-generated summary below.</CardDescription>
                    </CardHeader>
                    <CardContent className="min-h-[200px]">
                        {isLoading && (
                            <div className="space-y-4">
                                <Skeleton className="h-4 w-3/4" />
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-4 w-5/6" />
                                <Skeleton className="h-4 w-full" />
                            </div>
                        )}
                        {!isLoading && !summary && <p className="text-sm text-center text-muted-foreground">Your summary will appear here.</p>}
                        {!isLoading && summary && <SummaryRenderer content={summary} />}
                    </CardContent>
                </Card>
            </div>
          </TabsContent>

          <TabsContent value="summaries" className="flex-1 overflow-y-auto p-6">
              <div className="max-w-4xl mx-auto">
                <CardHeader className="px-0">
                    <CardTitle>Saved Summaries</CardTitle>
                    <CardDescription>Review your previously saved summaries.</CardDescription>
                </CardHeader>
                {summaries.length > 0 && (
                  <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-2">
                        <Checkbox id="select-all" onCheckedChange={(checked) => handleSelectAllSummaries(Boolean(checked))} checked={selectedSummaries.length === summaries.length && summaries.length > 0} />
                        <label htmlFor="select-all" className="text-sm font-medium">Select All</label>
                      </div>
                      <Button variant="destructive" size="sm" onClick={handleDeleteSummaries} disabled={selectedSummaries.length === 0}>
                        <Trash2 className="mr-2 h-4 w-4" /> Delete Selected
                      </Button>
                  </div>
                )}
                {summaries.length === 0 ? <p className="text-center text-muted-foreground">No summaries saved yet.</p> : (
                  <Accordion type="single" collapsible value={openAccordion || undefined} onValueChange={setOpenAccordion}>
                    {summaries.map((item) => (
                      <AccordionItem key={item.id} value={item.id} ref={el => accordionRef.current[item.id] = el}>
                        <div className="flex items-center">
                            <Checkbox 
                                className="mr-4"
                                checked={selectedSummaries.includes(item.id)}
                                onCheckedChange={(checked) => {
                                    setSelectedSummaries(prev => checked ? [...prev, item.id] : prev.filter(id => id !== item.id))
                                }}
                            />
                            <AccordionTrigger className="flex-1">
                                <div>
                                    <span className="font-semibold">{getNoteForSummary(item.id)?.title || `Meeting from ${new Date(item.timestamp).toLocaleDateString()}`}</span>
                                    <p className="text-xs text-muted-foreground">{new Date(item.timestamp).toLocaleString()}</p>
                                </div>
                            </AccordionTrigger>
                        </div>
                        <AccordionContent>
                           <SummaryRenderer content={item.summary}/>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                )}
              </div>
          </TabsContent>
          
          <TabsContent value="notes" className="flex-1 overflow-y-auto p-6">
            <div className="max-w-4xl mx-auto">
                <CardHeader className="px-0">
                  <CardTitle>Meeting Notes</CardTitle>
                  <CardDescription>Create new notes or review notes generated from summaries.</CardDescription>
                </CardHeader>

                <Card className="mb-6">
                    <CardHeader>
                        <CardTitle className="flex items-center"><PlusCircle className="mr-2" />Create a New Note</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Input
                            placeholder="Title (required)..."
                            value={newNote.title}
                            onChange={(e) => setNewNote({ ...newNote, title: e.target.value })}
                        />
                        <Textarea
                            placeholder="Key discussions (one per line)..."
                            value={newNote.key_discussions}
                            onChange={(e) => setNewNote({ ...newNote, key_discussions: e.target.value })}
                        />
                        <Textarea
                            placeholder="Decisions made (one per line)..."
                            value={newNote.decisions_made}
                            onChange={(e) => setNewNote({ ...newNote, decisions_made: e.target.value })}
                        />
                    </CardContent>
                    <CardFooter>
                        <Button onClick={handleSaveNewNote}>Save Manual Note</Button>
                    </CardFooter>
                </Card>
                
                {notes.length > 0 && (
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox id="select-all-notes" onCheckedChange={(checked) => handleSelectAllNotes(Boolean(checked))} checked={selectedNotes.length === notes.length && notes.length > 0} />
                      <label htmlFor="select-all-notes" className="text-sm font-medium">Select All</label>
                    </div>
                    <Button variant="destructive" size="sm" onClick={handleDeleteNotes} disabled={selectedNotes.length === 0}>
                      <Trash2 className="mr-2 h-4 w-4" /> Delete Selected
                    </Button>
                  </div>
                )}
                
                <div className="space-y-4">
                  {notes.length === 0 && <p className="text-center text-muted-foreground">No notes found.</p>}
                  {notes.map(note => {
                    const isExpanded = expandedNotes.includes(note.id);
                    const allPoints = [
                      ...(note.key_discussions || []),
                      ...(note.decisions_made || [])
                    ];
                    const previewText = allPoints.join(' ').substring(0, 150) + (allPoints.join(' ').length > 150 ? '...' : '');

                    return (
                      <Card key={note.id}>
                          <CardHeader className="flex flex-row justify-between items-start">
                              <div className="flex items-center gap-4">
                                <Checkbox
                                    checked={selectedNotes.includes(note.id)}
                                    onCheckedChange={(checked) => {
                                        setSelectedNotes(prev => checked ? [...prev, note.id] : prev.filter(id => id !== note.id))
                                    }}
                                />
                                <div>
                                    <CardTitle>{note.title}</CardTitle>
                                    <CardDescription>{new Date(note.timestamp).toLocaleString()}</CardDescription>
                                </div>
                              </div>
                              {note.summary_id && (
                                  <Button variant="link" size="sm" onClick={() => handleReminderLinkClick(note.summary_id!)}>
                                      <LinkIcon className="mr-2 h-4 w-4"/> View Full Summary
                                  </Button>
                              )}
                          </CardHeader>
                          <CardContent>
                            {isExpanded ? (
                              <>
                                {note.key_discussions && note.key_discussions.length > 0 && (
                                  <div className="mb-4">
                                    <h4 className="font-semibold mb-2">Key Discussion Points:</h4>
                                    <ul className="list-disc pl-5 space-y-1 text-sm">
                                      {note.key_discussions.map((item, index) => <li key={`kd-${index}`}>{item}</li>)}
                                    </ul>
                                  </div>
                                )}
                                {note.decisions_made && note.decisions_made.length > 0 && (
                                  <div>
                                    <h4 className="font-semibold mb-2">Decisions Made:</h4>
                                    <ul className="list-disc pl-5 space-y-1 text-sm">
                                      {note.decisions_made.map((item, index) => <li key={`dm-${index}`}>{item}</li>)}
                                    </ul>
                                  </div>
                                )}
                              </>
                            ) : (
                              <p className="text-sm text-muted-foreground">{previewText}</p>
                            )}
                          </CardContent>
                          <CardFooter>
                              <Button variant="link" className="p-0 h-auto" onClick={() => toggleNoteExpansion(note.id)}>
                                {isExpanded ? 'Read less' : 'Read more'}
                              </Button>
                          </CardFooter>
                      </Card>
                    )
                  })}
                </div>
            </div>
          </TabsContent>

          <TabsContent value="reminders" className="flex-1 overflow-y-auto p-6">
            <div className="max-w-4xl mx-auto space-y-6">
              <div>
                  <CardHeader className="px-0">
                    <CardTitle>Upcoming Reminders</CardTitle>
                    <CardDescription>Action items from your summaries and your manual reminders.</CardDescription>
                  </CardHeader>

                  <Card className="mb-6">
                    <CardHeader><CardTitle className="flex items-center"><PlusCircle className="mr-2"/>Add a Manual Reminder</CardTitle></CardHeader>
                    <CardContent className="flex flex-col sm:flex-row gap-2">
                      <Input
                        placeholder="New reminder..."
                        value={newReminderText}
                        onChange={(e) => setNewReminderText(e.target.value)}
                        className="flex-grow"
                      />
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant={"outline"} className={cn("w-full sm:w-[240px] justify-start text-left font-normal", !newReminderDate && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {newReminderDate ? format(newReminderDate, "PPP") : <span>Pick a due date</span>}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={newReminderDate} onSelect={setNewReminderDate} initialFocus />
                        </PopoverContent>
                      </Popover>
                       <div className="relative">
                            <Button variant="outline" className="w-full justify-start text-left font-normal hover:bg-accent" onClick={() => timeInputRef.current?.showPicker()}>
                                <Clock className="mr-2 h-4 w-4" />
                                <span>{newReminderTime}</span>
                            </Button>
                            <input 
                                type="time"
                                ref={timeInputRef}
                                value={newReminderTime}
                                onChange={(e) => setNewReminderTime(e.target.value)}
                                className="sr-only"
                            />
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button onClick={handleSaveNewReminder}>Add Reminder</Button>
                    </CardFooter>
                  </Card>
              </div>
              
              {reminders.length > 0 && (
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox id="select-all-reminders" onCheckedChange={(checked) => handleSelectAllReminders(Boolean(checked))} checked={selectedReminders.length === reminders.length && reminders.length > 0} />
                    <label htmlFor="select-all-reminders" className="text-sm font-medium">Select All</label>
                  </div>
                  <Button variant="destructive" size="sm" onClick={handleDeleteReminders} disabled={selectedReminders.length === 0}>
                    <Trash2 className="mr-2 h-4 w-4" /> Delete Selected
                  </Button>
                </div>
              )}

              {reminders.length === 0 ? <p className="text-center text-muted-foreground">No reminders yet.</p> : (
                  reminders.map(item => (
                    <div key={item.id} className="flex items-center gap-3">
                      <Checkbox
                          id={`select-reminder-${item.id}`}
                          aria-label={`Select reminder titled ${item.text}`}
                          checked={selectedReminders.includes(item.id)}
                          onCheckedChange={(checked) => {
                              setSelectedReminders(prev => checked ? [...prev, item.id] : prev.filter(id => id !== item.id))
                          }}
                      />
                      <Card className="flex-1">
                          <CardHeader className="flex-row items-center justify-between p-4">
                                <div className="flex items-center gap-3 flex-1">
                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleToggleReminder(item.id, item.completed)}>
                                        {item.completed ? <CheckCircle2 className="text-primary" /> : <Circle className="text-muted-foreground" />}
                                        <span className="sr-only">Toggle completion</span>
                                    </Button>
                                    {editingReminderId === item.id ? (
                                        <Input
                                            value={editingReminderText}
                                            onChange={(e) => setEditingReminderText(e.target.value)}
                                            className="h-8"
                                        />
                                    ) : (
                                        <span className={cn("flex-1 text-sm", item.completed && "line-through text-muted-foreground")}>
                                            {item.text}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-1">
                                    {editingReminderId === item.id ? (
                                        <>
                                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleUpdateReminder}><CheckCircle2 className="text-primary"/></Button>
                                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingReminderId(null)}><X className="text-destructive"/></Button>
                                        </>
                                    ) : (
                                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditingReminderId(item.id); setEditingReminderText(item.text); }}>
                                            <Pencil />
                                        </Button>
                                    )}
                                    {item.summaryId && (
                                        <Button variant="link" size="sm" onClick={() => handleReminderLinkClick(item.summaryId!)}>
                                            <LinkIcon className="mr-2 h-4 w-4" />
                                            View Summary
                                        </Button>
                                    )}
                                </div>
                          </CardHeader>
                          <CardContent className="p-4 pt-0">
                            <p className="text-xs text-muted-foreground">Due: {item.remindAt ? new Date(item.remindAt).toLocaleString() : 'No due date'}</p>
                             {item.summaryId && <p className="text-xs text-muted-foreground mt-1">From: {getNoteForSummary(item.summaryId)?.title || 'Meeting'}</p>}
                          </CardContent>
                      </Card>
                    </div>
                  ))
              )}
            </div>
          </TabsContent>

        </Tabs>
      </main>
      <AlertDialog open={deleteConfirmation.isOpen} onOpenChange={(isOpen) => setDeleteConfirmation({ ...deleteConfirmation, isOpen })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="space-y-4">
                <p>You are about to delete {deleteConfirmation.summaryIds.length} summary/summaries. This action can affect linked data. Please review the options carefully.</p>
                <div>
                  <h4 className="font-bold text-foreground">Delete Summary Only</h4>
                  <p className="text-xs">This will remove the summary but keep any associated notes and reminders. The links from those items to this summary will be broken.</p>
                </div>
                <div>
                  <h4 className="font-bold text-destructive">Delete Summary & Linked Data</h4>
                  <p className="text-xs">This will permanently delete the summary and ALL of its associated notes and reminders. This action cannot be undone.</p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-4">
             <AlertDialogAction onClick={() => handleConfirmDelete(false)}>
                Delete Summary Only
             </AlertDialogAction>
             <AlertDialogAction onClick={() => handleConfirmDelete(true)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                <AlertTriangle className="mr-2 h-4 w-4" />
                Delete & Linked Data
             </AlertDialogAction>
             <AlertDialogCancel className="mt-0 col-span-full sm:col-auto" onClick={() => setDeleteConfirmation({ isOpen: false, summaryIds: [] })}>Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
