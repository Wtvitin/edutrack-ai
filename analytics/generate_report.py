"""Generate a PDF in memory from an authorized, minimized account snapshot."""
import argparse
import io
import json
import sys
from pathlib import Path
from datetime import date
from xml.sax.saxutils import escape

import reportlab
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from calculate_progress import calculate_progress

_fonts = Path(reportlab.__file__).resolve().parent / "fonts"
pdfmetrics.registerFont(TTFont("EduTrack", str(_fonts / "Vera.ttf")))
pdfmetrics.registerFont(TTFont("EduTrackBold", str(_fonts / "VeraBd.ttf")))


def generate_report(payload):
    today = date.fromisoformat(payload["today"])
    selected = payload.get("subject", "all")
    subjects = [subject for subject in payload["data"]["subjects"] if selected == "all" or subject["id"] == selected]
    buffer = io.BytesIO()
    styles = getSampleStyleSheet()
    for style in styles.byName.values():
        if hasattr(style, "fontName"):
            style.fontName = "EduTrackBold" if "Bold" in style.fontName else "EduTrack"
    styles.add(ParagraphStyle(name="SmallBody", fontName="EduTrack", fontSize=9, leading=13))
    doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=42, rightMargin=42, topMargin=44, bottomMargin=44, title="EduTrack AI - Desempenho acadêmico", author="EduTrack AI")
    story = [Paragraph("EduTrack AI", styles["Title"]), Paragraph("Relatório de desempenho acadêmico", styles["Heading2"]), Paragraph("Emitido em " + today.strftime("%d/%m/%Y"), styles["BodyText"]), Spacer(1, 16)]
    if payload.get("demonstration"):
        story.extend([Paragraph("DEMONSTRAÇÃO COM DADOS FICTÍCIOS", styles["Heading3"]), Paragraph("Este arquivo demonstra a execução do gerador; não representa notas ou resultados reais do aluno.", styles["SmallBody"]), Spacer(1, 12)])
    story.append(Paragraph("Progresso acumulado das tarefas registradas. Tarefas canceladas ficam fora do total; tarefas sem prazo contam no progresso. Este indicador não equivale a nota, frequência ou domínio da matéria.", styles["SmallBody"]))
    story.append(Spacer(1, 12))
    rows = [["Disciplina", "Concluídas", "Total", "Progresso", "Atrasadas"]]
    for subject in subjects:
        tasks = [task for task in payload["data"]["tasks"] if task["subjectId"] == subject["id"]]
        progress = calculate_progress(tasks)
        overdue = sum(not task.get("done") and task.get("status") not in ("COMPLETED", "CANCELLED") and bool(task.get("due")) and date.fromisoformat(task["due"]) < today for task in tasks)
        rows.append([Paragraph(escape(subject["name"]), styles["SmallBody"]), str(progress["completed"]), str(progress["total"]), f'{progress["percentage"]:.2f}%', str(overdue)])
    if len(rows) == 1:
        story.append(Paragraph("Nenhuma disciplina encontrada para o filtro informado.", styles["BodyText"]))
    else:
        table = Table(rows, colWidths=[210, 65, 48, 72, 65], repeatRows=1, hAlign="LEFT")
        table.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#263C66")), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("FONTNAME", (0, 0), (-1, -1), "EduTrack"), ("FONTNAME", (0, 0), (-1, 0), "EduTrackBold"), ("FONTSIZE", (0, 0), (-1, -1), 9), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 9), ("BOTTOMPADDING", (0, 0), (-1, -1), 9), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F2F5FA")]), ("LINEBELOW", (0, 0), (-1, 0), .6, colors.HexColor("#263C66"))]))
        story.append(table)

    def footer(canvas, document):
        canvas.saveState()
        canvas.setFont("EduTrack", 8)
        canvas.setFillColor(colors.HexColor("#64748B"))
        canvas.drawString(42, 24, "EduTrack AI - relatório calculado em Python")
        canvas.drawRightString(A4[0] - 42, 24, str(document.page))
        canvas.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return buffer.getvalue()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output")
    args = parser.parse_args()
    try:
        pdf = generate_report(json.load(sys.stdin))
        if args.output:
            with open(args.output, "wb") as output:
                output.write(pdf)
        else:
            sys.stdout.buffer.write(pdf)
    except (ValueError, KeyError, TypeError) as error:
        print(json.dumps({"error": str(error)}), file=sys.stderr)
        sys.exit(1)
