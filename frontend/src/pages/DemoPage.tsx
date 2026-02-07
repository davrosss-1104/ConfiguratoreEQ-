import React, { useState } from 'react';
import { ArganoForm } from '@/components/sections/ArganoForm_NEW';
import { NormativeForm } from '@/components/sections/NormativeForm';
import { MaterialsTable } from '@/MaterialsTable';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Zap, FileText } from 'lucide-react';

export function DemoPage() {
  const preventivoId = 1; // ID preventivo demo

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg p-3">
              <Zap className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                Rule Engine Demo
              </h1>
              <p className="text-sm text-slate-600">
                Auto-aggiunta materiali con regole JSON
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Forms */}
          <div className="space-y-6">
            {/* Info Card */}
            <Card className="bg-gradient-to-br from-blue-50 to-purple-50 border-blue-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <FileText className="h-5 w-5 text-blue-600" />
                  Due Demo Funzionanti
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-start gap-2">
                  <div className="bg-amber-100 rounded-full p-1 mt-0.5">
                    <Zap className="h-3 w-3 text-amber-600" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">Demo 1: Gearless MRL</p>
                    <p className="text-slate-600 text-xs">
                      Seleziona "Gearless MRL" → 4 materiali aggiunti automaticamente
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <div className="bg-amber-100 rounded-full p-1 mt-0.5">
                    <Zap className="h-3 w-3 text-amber-600" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">Demo 2: EN81.20</p>
                    <p className="text-slate-600 text-xs">
                      Seleziona edizione "2020" → 2 materiali aggiunti automaticamente
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Forms Tabs */}
            <Tabs defaultValue="argano" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="argano" className="flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  Demo 1: Argano
                </TabsTrigger>
                <TabsTrigger value="normative" className="flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  Demo 2: Normative
                </TabsTrigger>
              </TabsList>
              <TabsContent value="argano" className="mt-6">
                <ArganoForm preventivoId={preventivoId} />
              </TabsContent>
              <TabsContent value="normative" className="mt-6">
                <NormativeForm preventivoId={preventivoId} />
              </TabsContent>
            </Tabs>
          </div>

          {/* Right: Materials Table */}
          <div className="lg:sticky lg:top-6 lg:self-start">
            <MaterialsTable preventivoId={preventivoId} />
          </div>
        </div>
      </div>
    </div>
  );
}
