import React, { useState, useEffect } from 'react';
import { Copy, Check, Download, Cpu, Terminal, Palette, FileCode } from 'lucide-react';
import { DetectedElement } from '../types/assets';
import { imageToRGB565, RGB565ConversionResult } from '../utils/rgb565';

interface Props {
  selectedElement: DetectedElement | null;
  globalPalette?: string[];
}

export const RGB565Inspector: React.FC<Props> = ({ selectedElement, globalPalette = [] }) => {
  const [conversion, setConversion] = useState<RGB565ConversionResult | null>(null);
  const [isLittleEndian, setIsLittleEndian] = useState<boolean>(true);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'c_header' | 'arduino_snippet' | 'palette_view'>('c_header');

  useEffect(() => {
    if (!selectedElement?.croppedDataUrl) {
      setConversion(null);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, img.width, img.height);
        const result = imageToRGB565(imgData, selectedElement.id);
        setConversion(result);
      }
    };
    img.src = selectedElement.croppedDataUrl;
  }, [selectedElement]);

  // Copy C Header to Clipboard
  const handleCopyCode = async () => {
    if (!conversion) return;
    await navigator.clipboard.writeText(conversion.cHeader);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Download raw binary .bin file
  const handleDownloadBin = () => {
    if (!conversion || !selectedElement) return;
    const buffer = isLittleEndian ? conversion.bytesLE : conversion.bytesBE;
    const blob = new Blob([buffer.buffer as ArrayBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedElement.id}_${isLittleEndian ? 'rgb565_le' : 'rgb565_be'}.bin`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const cleanName = selectedElement?.id.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase() || 'sprite';
  const upperName = cleanName.toUpperCase();

  const arduinoSnippet = `// ESPBoy & AKA TFT drawRGBBitmap snippet
#include "${cleanName}.h"

void drawPlayerSprite(int16_t x, int16_t y) {
  // Little-Endian 16-bit RGB565 bitmap rendering
  #if defined(ESPBOY)
    myESPboy.tft.drawRGBBitmap(x, y, ${cleanName}_bitmap, ${upperName}_WIDTH, ${upperName}_HEIGHT);
  #elif defined(AKA_CONSOLE)
    aka.display.drawBitmap565(x, y, ${cleanName}_bitmap, ${upperName}_WIDTH, ${upperName}_HEIGHT);
  #else
    // Generic Adafruit_GFX TFT
    tft.drawRGBBitmap(x, y, ${cleanName}_bitmap, ${upperName}_WIDTH, ${upperName}_HEIGHT);
  #endif
}
`;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-emerald-400" />
          <h3 className="font-semibold text-slate-100 text-sm">
            Moteur d'Export Rétro : ESPBoy & AKA (RGB565)
          </h3>
        </div>

        {/* Endianness & Hardware Target */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400">Format Octets:</span>
          <div className="flex items-center bg-slate-950 p-0.5 rounded border border-slate-800">
            <button
              onClick={() => setIsLittleEndian(true)}
              className={`px-2.5 py-1 rounded font-mono font-medium transition-colors ${
                isLittleEndian
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              RGB565_LE (ESPBoy / AKA)
            </button>
            <button
              onClick={() => setIsLittleEndian(false)}
              className={`px-2.5 py-1 rounded font-mono font-medium transition-colors ${
                !isLittleEndian
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              RGB565_BE (Standard)
            </button>
          </div>
        </div>
      </div>

      {selectedElement && conversion ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left Column: Sprite Info & Metrics */}
          <div className="bg-slate-950 border border-slate-800/80 rounded-lg p-4 flex flex-col gap-3 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-slate-400">Élément actif:</span>
              <span className="font-semibold text-slate-200">{selectedElement.label}</span>
            </div>

            {/* Sprite Preview with pixel grid */}
            <div className="h-32 bg-slate-900 rounded border border-slate-800 flex items-center justify-center p-2 relative overflow-hidden">
              <img
                src={selectedElement.croppedDataUrl}
                alt={selectedElement.label}
                className="max-h-full max-w-full object-contain pixelated drop-shadow-md"
              />
            </div>

            {/* Hardware Metrics Table */}
            <div className="grid grid-cols-2 gap-2 text-slate-300 font-mono text-[11px]">
              <div className="bg-slate-900/80 p-2 rounded border border-slate-800/80">
                <span className="text-slate-500 block text-[10px]">Résolution</span>
                <span className="font-bold text-sky-400">
                  {conversion.width} × {conversion.height} px
                </span>
              </div>
              <div className="bg-slate-900/80 p-2 rounded border border-slate-800/80">
                <span className="text-slate-500 block text-[10px]">Poids Flash / RAM</span>
                <span className="font-bold text-emerald-400">
                  {conversion.byteLength.toLocaleString()} octets
                </span>
              </div>
              <div className="bg-slate-900/80 p-2 rounded border border-slate-800/80">
                <span className="text-slate-500 block text-[10px]">Pixels totaux</span>
                <span className="text-slate-200">{conversion.totalPixels} px</span>
              </div>
              <div className="bg-slate-900/80 p-2 rounded border border-slate-800/80">
                <span className="text-slate-500 block text-[10px]">Format Binaire</span>
                <span className="text-amber-400 font-semibold">
                  {isLittleEndian ? '16-bit LE' : '16-bit BE'}
                </span>
              </div>
            </div>

            {/* Binary Download Button */}
            <button
              onClick={handleDownloadBin}
              className="mt-1 flex items-center justify-center gap-1.5 w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded font-medium transition-colors border border-slate-700"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Télécharger Binaire (.bin)</span>
            </button>
          </div>

          {/* Right 2 Columns: Code Inspector & Tabs */}
          <div className="lg:col-span-2 bg-slate-950 border border-slate-800/80 rounded-lg p-4 flex flex-col gap-3">
            {/* Tab navigation */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-1 text-xs">
                <button
                  onClick={() => setActiveTab('c_header')}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded transition-colors ${
                    activeTab === 'c_header'
                      ? 'bg-emerald-500/20 text-emerald-300 font-medium'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <FileCode className="w-3.5 h-3.5" />
                  <span>Header C PROGMEM (.h)</span>
                </button>
                <button
                  onClick={() => setActiveTab('arduino_snippet')}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded transition-colors ${
                    activeTab === 'arduino_snippet'
                      ? 'bg-emerald-500/20 text-emerald-300 font-medium'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Terminal className="w-3.5 h-3.5" />
                  <span>Code Arduino / ESPBoy</span>
                </button>
                <button
                  onClick={() => setActiveTab('palette_view')}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded transition-colors ${
                    activeTab === 'palette_view'
                      ? 'bg-emerald-500/20 text-emerald-300 font-medium'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Palette className="w-3.5 h-3.5" />
                  <span>Palette RGB565 ({conversion.palette.length})</span>
                </button>
              </div>

              {/* Copy Code button */}
              <button
                onClick={handleCopyCode}
                className="flex items-center gap-1 text-xs px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 transition-colors"
              >
                {copiedCode ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copié !</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copier code</span>
                  </>
                )}
              </button>
            </div>

            {/* Code Output View */}
            <div className="relative">
              {activeTab === 'c_header' && (
                <pre className="font-mono text-[11px] text-slate-300 bg-slate-900 p-3 rounded border border-slate-800 overflow-x-auto max-h-60 leading-relaxed">
                  <code>{conversion.cHeader}</code>
                </pre>
              )}

              {activeTab === 'arduino_snippet' && (
                <pre className="font-mono text-[11px] text-sky-300 bg-slate-900 p-3 rounded border border-slate-800 overflow-x-auto max-h-60 leading-relaxed">
                  <code>{arduinoSnippet}</code>
                </pre>
              )}

              {activeTab === 'palette_view' && (
                <div className="bg-slate-900 p-3 rounded border border-slate-800 max-h-60 overflow-y-auto">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {conversion.palette.map((hex, i) => {
                      const r = parseInt(hex.slice(1, 3), 16) || 0;
                      const g = parseInt(hex.slice(3, 5), 16) || 0;
                      const b = parseInt(hex.slice(5, 7), 16) || 0;
                      const rgb565Val = ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
                      const hex565 = '0x' + rgb565Val.toString(16).padStart(4, '0').toUpperCase();

                      return (
                        <div
                          key={i}
                          className="flex items-center gap-2 p-1.5 rounded bg-slate-950 border border-slate-800 text-[11px] font-mono"
                        >
                          <span
                            className="w-4 h-4 rounded border border-white/20 shrink-0"
                            style={{ backgroundColor: hex }}
                          />
                          <div className="flex flex-col">
                            <span className="text-slate-200">{hex}</span>
                            <span className="text-emerald-400 text-[10px]">{hex565}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="py-8 text-center text-xs text-slate-500 bg-slate-950 rounded-lg border border-slate-800/80">
          Sélectionnez un élément extrait ci-dessus pour inspecter sa conversion RGB565 et ses headers C pour ESPBoy / AKA.
        </div>
      )}
    </div>
  );
};
