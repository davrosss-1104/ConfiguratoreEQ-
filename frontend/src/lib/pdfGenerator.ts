import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

interface PreventivoData {
  datiCommessa: any;
  datiPrincipali: any;
  normative: any;
  argano: any;
  porte: any;
  disposizioneVano: any;
  materiali: any[];
}

// Utility per checkbox
function drawCheckbox(pdf: jsPDF, x: number, y: number, checked: boolean, size: number = 3) {
  // Box
  pdf.setDrawColor(80, 80, 80);
  pdf.setLineWidth(0.3);
  pdf.rect(x, y, size, size);
  
  // Check se selezionato
  if (checked) {
    pdf.setLineWidth(0.5);
    pdf.line(x + 0.5, y + 1.5, x + 1.2, y + 2.2);
    pdf.line(x + 1.2, y + 2.2, x + 2.5, y + 0.5);
  }
}

// Utility per etichetta + valore in linea
function drawFieldInline(
  pdf: jsPDF, 
  x: number, 
  y: number, 
  label: string, 
  value: string,
  labelWidth: number = 40
) {
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.text(label + ':', x, y);
  
  pdf.setFont('helvetica', 'normal');
  pdf.text(value || 'N.D.', x + labelWidth, y);
}

export async function generatePDF(preventivo: PreventivoData, preventivoId: string) {
  const pdf = new jsPDF();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  let yPos = 15;

  // Colori brand
  const brandRed = [210, 32, 39] as const;
  const darkGray = [51, 51, 51] as const;
  const lightGray = [240, 240, 240] as const;

  // ============================================
  // HEADER ELETTROQUADRI
  // ============================================
  
  // Rettangolo rosso
  pdf.setFillColor(...brandRed);
  pdf.rect(0, 0, pageWidth, 12, 'F');

  // Logo + Nome azienda
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.text('⚡', 8, 8);
  pdf.setFontSize(11);
  pdf.text('ELETTROQUADRI S.r.l.', 18, 8);

  // Info contatti destra
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'normal');
  pdf.text('www.elettroquadri.net', pageWidth - 45, 6);
  pdf.text('sales@elettroquadri.net', pageWidth - 45, 10);

  yPos = 15;

  // Sedi
  pdf.setTextColor(...darkGray);
  pdf.setFontSize(7);
  pdf.text('Sede Legale: Via Puccini, 1 - 21050 Bisuschio (VA) | Tel. 0332 470049 | Fax 0332 474032', 10, yPos);
  yPos += 3;
  pdf.text('Sede di Roma: Via Manduria, 9/11 - 00177 Roma | Tel. 06 89670766 | Fax 06 89670765', 10, yPos);
  yPos += 8;

  // ============================================
  // INTESTAZIONE DOCUMENTO
  // ============================================
  
  // Box info documento
  pdf.setDrawColor(150, 150, 150);
  pdf.setLineWidth(0.5);
  pdf.rect(10, yPos, pageWidth - 20, 30);

  // Divisore verticale centrale
  const centerX = pageWidth / 2;
  pdf.line(centerX, yPos, centerX, yPos + 30);

  // Colonna SINISTRA
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.text('PREVENTIVO / OFFERTA', 12, yPos + 6);
  
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text(`N° ${preventivoId}`, 12, yPos + 12);
  pdf.text(`Data: ${format(new Date(), 'dd/MM/yyyy', { locale: it })}`, 12, yPos + 17);
  pdf.text(`Riferimento: ${preventivo.datiCommessa?.riferimento || '________'}`, 12, yPos + 22);
  pdf.text(`Quantità: ${preventivo.datiCommessa?.quantita || '1'}`, 12, yPos + 27);

  // Colonna DESTRA
  pdf.setFont('helvetica', 'bold');
  pdf.text('Spettabile Ditta:', centerX + 2, yPos + 6);
  pdf.setFont('helvetica', 'normal');
  pdf.text(preventivo.datiCommessa?.cliente || '____________________', centerX + 2, yPos + 11);
  pdf.text(`Consegna: ${preventivo.datiCommessa?.data_consegna || '___/___/______'}`, centerX + 2, yPos + 17);
  pdf.text(`Destinazione: ${preventivo.datiCommessa?.destinazione || '_____________'}`, centerX + 2, yPos + 22);
  pdf.text(`Pagamento: ${preventivo.datiCommessa?.pagamento || '______________'}`, centerX + 2, yPos + 27);

  yPos += 35;

  // ============================================
  // TIPO ASCENSORE E QUADRO
  // ============================================
  
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.setFillColor(...lightGray);
  pdf.rect(10, yPos, pageWidth - 20, 7, 'F');
  pdf.text('ASCENSORE ELETTRICO', 12, yPos + 5);
  yPos += 10;

  // Tipo impianto (checkbox)
  const tipoImpianto = preventivo.datiPrincipali?.tipoImpianto || '';
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  
  pdf.text('Tipo:', 12, yPos);
  drawCheckbox(pdf, 25, yPos - 2.5, tipoImpianto === 'Geared');
  pdf.text('Geared', 30, yPos);
  drawCheckbox(pdf, 48, yPos - 2.5, tipoImpianto === 'Gearless');
  pdf.text('Gearless', 53, yPos);
  drawCheckbox(pdf, 78, yPos - 2.5, tipoImpianto === 'Idraulico');
  pdf.text('Idraulico', 83, yPos);
  
  // Locale macchina
  pdf.text('L.M.:', 110, yPos);
  const conLM = preventivo.datiPrincipali?.conLocaleMacchina !== false;
  drawCheckbox(pdf, 122, yPos - 2.5, conLM);
  pdf.text('Con', 127, yPos);
  drawCheckbox(pdf, 140, yPos - 2.5, !conLM);
  pdf.text('Senza (MRL)', 145, yPos);
  yPos += 7;

  // Quadro di manovra
  pdf.text('Quadro:', 12, yPos);
  const quadroMP2 = preventivo.datiPrincipali?.tipoQuadro === 'MP2';
  const quadroMP3 = preventivo.datiPrincipali?.tipoQuadro === 'MP3';
  drawCheckbox(pdf, 28, yPos - 2.5, quadroMP2);
  pdf.text('MP2 Precablato', 33, yPos);
  drawCheckbox(pdf, 65, yPos - 2.5, quadroMP3);
  pdf.text('MP3 Precablato', 70, yPos);
  drawCheckbox(pdf, 105, yPos - 2.5, false);
  pdf.text('Materiale non precablato', 110, yPos);
  yPos += 10;

  // ============================================
  // NORMATIVE (checkbox orizzontale)
  // ============================================
  
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.text('Norme:', 12, yPos);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);

  const norme = preventivo.normative || {};
  
  // Prima riga
  drawCheckbox(pdf, 28, yPos - 2.5, !!norme.en8120);
  pdf.text(`EN-81.20`, 33, yPos);
  if (norme.en8120) {
    pdf.setFont('helvetica', 'bold');
    pdf.text(norme.en8120, 48, yPos);
    pdf.setFont('helvetica', 'normal');
  }
  
  drawCheckbox(pdf, 60, yPos - 2.5, !!norme.en8128);
  pdf.text('EN-81.28', 65, yPos);
  
  drawCheckbox(pdf, 85, yPos - 2.5, !!norme.en8170);
  pdf.text('EN-81.70', 90, yPos);
  
  drawCheckbox(pdf, 110, yPos - 2.5, !!norme.en8172);
  pdf.text('EN-81.72', 115, yPos);
  
  drawCheckbox(pdf, 135, yPos - 2.5, !!norme.en8173);
  pdf.text('EN-81.73', 140, yPos);
  
  drawCheckbox(pdf, 160, yPos - 2.5, !!norme.dm236);
  pdf.text('DM236 (L.13)', 165, yPos);
  
  yPos += 7;

  // Emendamento A3
  pdf.setFont('helvetica', 'bold');
  pdf.text('Emendamento A3:', 12, yPos);
  pdf.setFont('helvetica', 'normal');
  const conA3 = norme.emendamentoA3 || false;
  drawCheckbox(pdf, 42, yPos - 2.5, conA3);
  pdf.text('Contatti freno', 47, yPos);
  drawCheckbox(pdf, 72, yPos - 2.5, conA3);
  pdf.text('Con rilivellamento', 77, yPos);
  yPos += 10;

  // ============================================
  // INFO TECNICHE (2 colonne)
  // ============================================
  
  pdf.setFont('helvetica', 'bold');
  pdf.setFillColor(...lightGray);
  pdf.rect(10, yPos, pageWidth - 20, 6, 'F');
  pdf.text('INFO', 12, yPos + 4);
  yPos += 9;

  const colLeft = 12;
  const colRight = centerX + 2;
  let yLeft = yPos;
  let yRight = yPos;

  // Colonna SINISTRA
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  
  drawFieldInline(pdf, colLeft, yLeft, 'N° Fermate', preventivo.datiPrincipali?.numero_fermate?.toString() || '');
  yLeft += 5;
  
  drawFieldInline(pdf, colLeft, yLeft, 'N° Servizi', preventivo.datiPrincipali?.numero_servizi?.toString() || '');
  yLeft += 5;
  
  drawFieldInline(pdf, colLeft, yLeft, 'Velocità', `${preventivo.datiPrincipali?.velocita || ''} m/s`);
  yLeft += 5;
  
  drawFieldInline(pdf, colLeft, yLeft, 'Corsa', `${preventivo.datiPrincipali?.corsa || ''} m`);
  yLeft += 5;

  drawFieldInline(pdf, colLeft, yLeft, 'Portata', `${preventivo.datiPrincipali?.portata || ''} kg`);
  yLeft += 5;

  drawFieldInline(pdf, colLeft, yLeft, 'Persone', preventivo.datiPrincipali?.persone?.toString() || '');

  // Colonna DESTRA
  const tensioni = preventivo.datiPrincipali?.tensioni || {};
  drawFieldInline(pdf, colRight, yRight, 'Forza Motrice', `${tensioni.forzaMotrice || ''} V`);
  yRight += 5;
  
  drawFieldInline(pdf, colRight, yRight, 'Luce', `${tensioni.luce || ''} V`);
  yRight += 5;
  
  drawFieldInline(pdf, colRight, yRight, 'Manovra', `${tensioni.manovra || ''} Vcc`);
  yRight += 5;
  
  drawFieldInline(pdf, colRight, yRight, 'Freno', `${tensioni.freno || ''} Vcc`);
  yRight += 5;

  yPos = Math.max(yLeft, yRight) + 10;

  // ============================================
  // ARGANO E MOTORE
  // ============================================
  
  if (preventivo.argano) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFillColor(...lightGray);
    pdf.rect(10, yPos, pageWidth - 20, 6, 'F');
    pdf.text('ARGANO', 12, yPos + 4);
    yPos += 9;

    yLeft = yPos;
    yRight = yPos;

    pdf.setFont('helvetica', 'normal');
    
    // Colonna SINISTRA
    drawFieldInline(pdf, colLeft, yLeft, 'Marca Argano', preventivo.argano.marcaArgano || '');
    yLeft += 5;
    
    const tipoTrazione = preventivo.argano.tipoTrazione || '';
    pdf.text('Trazione:', colLeft, yLeft);
    drawCheckbox(pdf, colLeft + 20, yLeft - 2.5, tipoTrazione === 'Gearless MRL');
    pdf.text('Gearless MRL', colLeft + 25, yLeft);
    drawCheckbox(pdf, colLeft + 55, yLeft - 2.5, tipoTrazione === 'Geared');
    pdf.text('Geared', colLeft + 60, yLeft);
    yLeft += 5;

    drawFieldInline(pdf, colLeft, yLeft, 'Tipo VVVF', preventivo.argano.tipoVVVF || '');
    yLeft += 5;

    drawFieldInline(pdf, colLeft, yLeft, 'Marca Inverter', preventivo.argano.marcaInverter || '');

    // Colonna DESTRA
    drawFieldInline(pdf, colRight, yRight, 'Motore KW', preventivo.argano.potenzaMotore?.toString() || '');
    yRight += 5;
    
    drawFieldInline(pdf, colRight, yRight, 'Motore AMP', preventivo.argano.correnteMotore?.toString() || '');
    yRight += 5;

    drawFieldInline(pdf, colRight, yRight, 'Ventilazione', `${preventivo.argano.ventilazione || ''} V`);

    yPos = Math.max(yLeft, yRight) + 10;
  }

  // ============================================
  // PORTE
  // ============================================
  
  if (preventivo.porte) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFillColor(...lightGray);
    pdf.rect(10, yPos, pageWidth - 20, 6, 'F');
    pdf.text('PORTE', 12, yPos + 4);
    yPos += 9;

    pdf.setFont('helvetica', 'normal');
    
    pdf.text('Porte di Piano:', colLeft, yPos);
    const portePianoAuto = preventivo.porte.tipoPortePiano === 'Automatiche';
    drawCheckbox(pdf, colLeft + 30, yPos - 2.5, !portePianoAuto);
    pdf.text('Manuali', colLeft + 35, yPos);
    drawCheckbox(pdf, colLeft + 55, yPos - 2.5, portePianoAuto);
    pdf.text('Automatiche', colLeft + 60, yPos);
    
    pdf.text('Porte di Cabina:', colRight, yPos);
    const porteCabinaAuto = preventivo.porte.tipoPorteCabina === 'Automatiche';
    drawCheckbox(pdf, colRight + 30, yPos - 2.5, !porteCabinaAuto);
    pdf.text('Manuali', colRight + 35, yPos);
    drawCheckbox(pdf, colRight + 55, yPos - 2.5, porteCabinaAuto);
    pdf.text('Automatiche', colRight + 60, yPos);
    yPos += 7;

    drawFieldInline(pdf, colLeft, yPos, 'Operatore', preventivo.porte.tipoOperatore || '');
    drawFieldInline(pdf, colRight, yPos, 'N° Accessi', preventivo.porte.numeroAccessi?.toString() || '1');
    yPos += 7;

    const apertura = preventivo.porte.tipoApertura || '';
    pdf.text('Apertura:', colLeft, yPos);
    drawCheckbox(pdf, colLeft + 20, yPos - 2.5, apertura === 'Alternata');
    pdf.text('Alternata', colLeft + 25, yPos);
    drawCheckbox(pdf, colLeft + 45, yPos - 2.5, apertura === 'Contemporanea');
    pdf.text('Contemporanea', colLeft + 50, yPos);
    drawCheckbox(pdf, colLeft + 82, yPos - 2.5, apertura === 'Selettiva');
    pdf.text('Selettiva', colLeft + 87, yPos);
    
    yPos += 10;
  }

  // Verifica nuova pagina
  if (yPos > pageHeight - 80) {
    pdf.addPage();
    yPos = 20;
  }

  // ============================================
  // DISPOSIZIONE VANO - SBARCHI
  // ============================================
  
  if (preventivo.disposizioneVano && preventivo.disposizioneVano.sbarchi) {
    try {
      const sbarchi = JSON.parse(preventivo.disposizioneVano.sbarchi);
      
      pdf.setFont('helvetica', 'bold');
      pdf.setFillColor(...brandRed);
      pdf.setTextColor(255, 255, 255);
      pdf.rect(10, yPos, pageWidth - 20, 7, 'F');
      pdf.text('DISPOSIZIONE VANO', 12, yPos + 5);
      yPos += 10;

      pdf.setTextColor(...darkGray);

      const sbarchiData = sbarchi.map((sb: any) => [
        `${sb.piano}`,
        sb.denominazione || `Piano ${sb.piano}`,
        `${sb.interpiano} m`,
        sb.latoA ? '✓' : '',
        sb.latoB ? '✓' : '',
        sb.latoC ? '✓' : '',
        sb.latoD ? '✓' : '',
        sb.posizioneSirena || '-',
      ]);

      autoTable(pdf, {
        startY: yPos,
        head: [['Piano', 'Denominazione', 'Interpiano', 'A', 'B', 'C', 'D', 'Sirena']],
        body: sbarchiData,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2, lineColor: [150, 150, 150], lineWidth: 0.3 },
        headStyles: { 
          fillColor: darkGray as unknown as [number, number, number], 
          textColor: 255, 
          fontStyle: 'bold',
          halign: 'center'
        },
        columnStyles: {
          0: { halign: 'center', cellWidth: 15 },
          1: { halign: 'left', cellWidth: 50 },
          2: { halign: 'center', cellWidth: 20 },
          3: { halign: 'center', cellWidth: 10 },
          4: { halign: 'center', cellWidth: 10 },
          5: { halign: 'center', cellWidth: 10 },
          6: { halign: 'center', cellWidth: 10 },
          7: { halign: 'left', cellWidth: 40 },
        },
        margin: { left: 10, right: 10 },
      });

      yPos = (pdf as any).lastAutoTable.finalY + 10;
    } catch (e) {
      console.error('Errore parsing sbarchi:', e);
    }
  }

  // Verifica nuova pagina
  if (yPos > pageHeight - 100) {
    pdf.addPage();
    yPos = 20;
  }

  // ============================================
  // MATERIALI E COMPONENTI
  // ============================================
  
  pdf.setFont('helvetica', 'bold');
  pdf.setFillColor(...brandRed);
  pdf.setTextColor(255, 255, 255);
  pdf.rect(10, yPos, pageWidth - 20, 7, 'F');
  pdf.text('MATERIALI E COMPONENTI', 12, yPos + 5);
  yPos += 10;

  pdf.setTextColor(...darkGray);

  if (preventivo.materiali && preventivo.materiali.length > 0) {
    // Raggruppa per categoria
    const materialiPerCat: Record<string, any[]> = {};
    preventivo.materiali.forEach((mat: any) => {
      const cat = mat.categoria || 'Vari';
      if (!materialiPerCat[cat]) materialiPerCat[cat] = [];
      materialiPerCat[cat].push(mat);
    });

    // Stampa ogni categoria
    Object.entries(materialiPerCat).forEach(([categoria, mats]) => {
      // Header categoria
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setFillColor(...lightGray);
      pdf.rect(10, yPos, pageWidth - 20, 5, 'F');
      pdf.text(categoria.toUpperCase(), 12, yPos + 3.5);
      yPos += 7;

      const materialsData = mats.map((mat: any) => [
        mat.codice || '-',
        mat.descrizione || 'N.D.',
        mat.quantita?.toString() || '1',
        mat.um || 'pz',
        `€ ${(mat.prezzo_unitario || 0).toFixed(2)}`,
        `€ ${(mat.prezzo_totale || 0).toFixed(2)}`,
      ]);

      autoTable(pdf, {
        startY: yPos,
        head: [['Codice', 'Descrizione', 'Q.tà', 'U.M.', 'Prezzo', 'Totale']],
        body: materialsData,
        theme: 'striped',
        styles: { 
          fontSize: 8, 
          cellPadding: 1.5,
          lineColor: [200, 200, 200],
          lineWidth: 0.1
        },
        headStyles: { 
          fillColor: [100, 100, 100], 
          textColor: 255, 
          fontStyle: 'bold',
          fontSize: 8
        },
        columnStyles: {
          0: { cellWidth: 25, halign: 'left' },
          1: { cellWidth: 80, halign: 'left' },
          2: { cellWidth: 12, halign: 'center' },
          3: { cellWidth: 12, halign: 'center' },
          4: { cellWidth: 20, halign: 'right' },
          5: { cellWidth: 20, halign: 'right', fontStyle: 'bold' },
        },
        margin: { left: 10, right: 10 },
        alternateRowStyles: { fillColor: [250, 250, 250] }
      });

      yPos = (pdf as any).lastAutoTable.finalY + 6;

      // Verifica nuova pagina
      if (yPos > pageHeight - 50) {
        pdf.addPage();
        yPos = 20;
      }
    });

    // ============================================
    // TOTALI
    // ============================================
    
    const totaleImponibile = preventivo.materiali.reduce(
      (sum: number, mat: any) => sum + (mat.prezzo_totale || 0),
      0
    );
    const iva = totaleImponibile * 0.22;
    const totaleLordo = totaleImponibile + iva;

    // Verifica spazio
    if (yPos > pageHeight - 40) {
      pdf.addPage();
      yPos = 20;
    }

    yPos += 5;
    
    // Linea separatore
    pdf.setDrawColor(...darkGray);
    pdf.setLineWidth(0.5);
    pdf.line(10, yPos, pageWidth - 10, yPos);
    yPos += 8;

    // Box totali a destra
    const totX = pageWidth - 85;
    
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text('Totale Imponibile:', totX, yPos);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`€ ${totaleImponibile.toFixed(2)}`, totX + 50, yPos, { align: 'right' });
    yPos += 6;

    pdf.setFont('helvetica', 'normal');
    pdf.text('IVA 22%:', totX, yPos);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`€ ${iva.toFixed(2)}`, totX + 50, yPos, { align: 'right' });
    yPos += 8;

    // Box rosso totale finale
    pdf.setFillColor(...brandRed);
    pdf.rect(totX - 3, yPos - 5, 58, 8, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(11);
    pdf.text('TOTALE:', totX, yPos);
    pdf.text(`€ ${totaleLordo.toFixed(2)}`, totX + 50, yPos, { align: 'right' });
    
  } else {
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(9);
    pdf.text('Nessun materiale presente', 12, yPos);
  }

  // ============================================
  // FOOTER (tutte le pagine)
  // ============================================
  
  const numPages = (pdf as any).internal.getNumberOfPages();
  
  for (let i = 1; i <= numPages; i++) {
    pdf.setPage(i);
    
    // Linea footer
    pdf.setDrawColor(180, 180, 180);
    pdf.setLineWidth(0.3);
    pdf.line(10, pageHeight - 15, pageWidth - 10, pageHeight - 15);
    
    // Info azienda
    pdf.setTextColor(100, 100, 100);
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'normal');
    pdf.text(
      'Elettroquadri S.r.l. - Via Puccini, 1 - Bisuschio (VA) - P.IVA 00000000000',
      pageWidth / 2,
      pageHeight - 10,
      { align: 'center' }
    );
    
    // Numero pagina
    pdf.setFont('helvetica', 'bold');
    pdf.text(
      `Pag. ${i}/${numPages}`,
      pageWidth - 15,
      pageHeight - 10,
      { align: 'right' }
    );
    
    // Data documento
    pdf.text(
      `${format(new Date(), 'dd/MM/yyyy')}`,
      15,
      pageHeight - 10
    );
  }

  // ============================================
  // SALVA PDF
  // ============================================
  
  const fileName = `Preventivo_${preventivoId}_${format(new Date(), 'yyyyMMdd')}.pdf`;
  pdf.save(fileName);
  
  return fileName;
}
