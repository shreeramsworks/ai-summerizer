
"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Zap, ShieldCheck } from 'lucide-react';
import AuthForm from '@/components/AuthForm';

export default function Home() {
  const [authMode, setAuthMode] = useState<'login' | 'signup' | null>(null);

  return (
    <>
      <div className="flex flex-col min-h-screen bg-background">
        <header className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
              <FileText className="h-8 w-8 text-primary" />
              <h1 className="text-xl font-bold">Meeting Summarizer Pro</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => setAuthMode('login')}>Sign In</Button>
            <Button onClick={() => setAuthMode('signup')}>Sign Up</Button>
          </div>
        </header>

        <main className="flex-grow container mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <section className="mb-24">
              <h2 className="text-4xl md:text-5xl font-extrabold mb-4 text-foreground">
                  The Smartest Way to Handle Meetings
              </h2>
              <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
                  Stop wasting time on meeting notes. Upload your transcripts and get instant, AI-powered summaries, action items, and reminders.
              </p>
              <Button size="lg" onClick={() => setAuthMode('signup')}>Get Started for Free</Button>
          </section>

          <section>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <Card>
                <CardHeader className="items-center">
                  <div className="p-3 rounded-full bg-primary/10 mb-2">
                      <Zap className="h-8 w-8 text-primary" />
                  </div>
                  <CardTitle>Instant Summaries</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Our advanced AI distills hours of conversation into concise summaries in seconds. Focus on what matters.
                  </CardDescription>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="items-center">
                   <div className="p-3 rounded-full bg-primary/10 mb-2">
                      <FileText className="h-8 w-8 text-primary" />
                  </div>
                  <CardTitle>Action Item Tracking</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Automatically extract action items and assignees so nothing falls through the cracks. Set reminders effortlessly.
                  </CardDescription>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="items-center">
                   <div className="p-3 rounded-full bg-primary/10 mb-2">
                      <ShieldCheck className="h-8 w-8 text-primary" />
                  </div>
                  <CardTitle>Secure & Private</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Your data is your own. All summaries and reminders are stored securely in your private account.
                  </CardDescription>
                </CardContent>
              </Card>
            </div>
          </section>
        </main>

         <footer className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center text-muted-foreground text-sm">
              <p>&copy; {new Date().getFullYear()} Meeting Summarizer Pro. All Rights Reserved.</p>
          </footer>
      </div>

      {authMode && (
        <AuthForm
          mode={authMode}
          onClose={() => setAuthMode(null)}
        />
      )}
    </>
  );
}
