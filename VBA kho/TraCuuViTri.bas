Attribute VB_Name = "TraCuuViTri"
' ============================================================
'  MODULE: TraCuuViTri v6
' ============================================================

Private Const SHEET_DATA    As String = "DemKho"
Private Const SHEET_TRACUU  As String = "Tra Cuu"
Private Const HEADER_ROW    As Long = 2
Private Const COL_MA        As Long = 2
Private Const COL_TEN       As Long = 3
Private Const COL_DVT       As Long = 4
Private Const COL_VITRI     As Long = 5
Private Const COL_SL        As Long = 7

Sub TaoSheetTraCuu()
    Dim ws As Worksheet, wsDel As Worksheet
    Application.DisplayAlerts = False
    For Each wsDel In ThisWorkbook.Sheets
        If wsDel.Name = SHEET_TRACUU Then wsDel.Delete
    Next wsDel
    Application.DisplayAlerts = True

    Set ws = ThisWorkbook.Sheets.Add(Before:=ThisWorkbook.Sheets(1))
    ws.Name = SHEET_TRACUU

    ' Tieu de
    ws.Range("A1:G1").Merge
    With ws.Range("A1")
        .value = "TRA CUU VI TRI HANG HOA"
        .Font.Bold = True: .Font.Size = 13: .Font.Color = RGB(255, 255, 255)
        .Interior.Color = RGB(31, 73, 125): .HorizontalAlignment = xlCenter
        .RowHeight = 30
    End With

    ws.Range("A2:G2").Merge
    With ws.Range("A2")
        .value = "Paste danh sach ma can kiem vao cot B (tu B5 tro xuong) -> Bam nut TIM KIEM"
        .Font.Italic = True: .Font.Size = 9: .Font.Color = RGB(100, 100, 100)
        .HorizontalAlignment = xlCenter
    End With

    ' Header vung nhap
    ws.Range("A4").value = "STT"
    ws.Range("B4").value = "Ma HH can kiem (paste vao day)"
    For Each cel In Array(ws.Range("A4"), ws.Range("B4"))
        cel.Font.Bold = True: cel.Font.Color = RGB(255, 255, 255)
        cel.Interior.Color = RGB(31, 73, 125): cel.HorizontalAlignment = xlCenter
    Next cel
    ws.Range("C4:G4").Merge
    ws.Range("C4").Interior.Color = RGB(31, 73, 125)

    ' Vung nhap mau vang
    With ws.Range("B5:B54")
        .Interior.Color = RGB(255, 255, 153)
        .Borders.LineStyle = xlContinuous
        .Borders.Color = RGB(200, 200, 200)
        .Font.Size = 10
    End With
    With ws.Range("A5:A54")
        .Interior.Color = RGB(245, 245, 245)
        .Borders.LineStyle = xlContinuous
        .Borders.Color = RGB(200, 200, 200)
        .HorizontalAlignment = xlCenter
        .Font.Size = 9: .Font.Color = RGB(150, 150, 150)
    End With
    Dim r As Long
    For r = 1 To 50
        ws.Cells(4 + r, 1).value = r
    Next r

    ' Nut TIM KIEM
    Dim shpTim As Shape
    Set shpTim = ws.Shapes.AddShape(msoShapeRoundedRectangle, _
        ws.Range("C5").Left + 5, ws.Range("C5").Top + 2, 150, 28)
    With shpTim
        .Name = "NutTimKiem"
        .TextFrame.Characters.Text = "TIM KIEM TAT CA"
        .TextFrame.Characters.Font.Bold = True
        .TextFrame.Characters.Font.Size = 11
        .TextFrame.Characters.Font.Color = RGB(255, 255, 255)
        .TextFrame.HorizontalAlignment = xlHAlignCenter
        .TextFrame.VerticalAlignment = xlVAlignCenter
        .Fill.ForeColor.RGB = RGB(0, 130, 0)
        .Line.Visible = msoFalse
        .OnAction = "TimKiemNhieuMa"
    End With

    ' Nut XOA
    Dim shpXoa As Shape
    Set shpXoa = ws.Shapes.AddShape(msoShapeRoundedRectangle, _
        ws.Range("E5").Left + 5, ws.Range("E5").Top + 2, 100, 28)
    With shpXoa
        .Name = "NutXoa"
        .TextFrame.Characters.Text = "XOA HET"
        .TextFrame.Characters.Font.Bold = True
        .TextFrame.Characters.Font.Size = 11
        .TextFrame.Characters.Font.Color = RGB(255, 255, 255)
        .TextFrame.HorizontalAlignment = xlHAlignCenter
        .TextFrame.VerticalAlignment = xlVAlignCenter
        .Fill.ForeColor.RGB = RGB(192, 0, 0)
        .Line.Visible = msoFalse
        .OnAction = "XoaHet"
    End With

    ' Dong ngan cach + header ket qua
    ws.Range("A55:G55").Interior.Color = RGB(180, 180, 180)
    ws.Rows(55).RowHeight = 4

    Dim headers As Variant
    headers = Array("STT", "Ma HH", "Ten HH", "DVT", "Vi tri", "SL Kho", "SL Kiem")
    Dim ci As Integer
    For ci = 0 To 6
        With ws.Cells(56, ci + 1)
            .value = headers(ci)
            .Font.Bold = True: .Font.Color = RGB(255, 255, 255)
            .Interior.Color = RGB(31, 73, 125)
            .HorizontalAlignment = xlCenter
            .Borders.LineStyle = xlContinuous
            .Borders.Color = RGB(180, 180, 180)
        End With
    Next ci
    ws.Rows(56).RowHeight = 20

    ws.Columns("A").ColumnWidth = 5
    ws.Columns("B").ColumnWidth = 22
    ws.Columns("C").ColumnWidth = 40
    ws.Columns("D").ColumnWidth = 8
    ws.Columns("E").ColumnWidth = 16
    ws.Columns("F").ColumnWidth = 10
    ws.Columns("G").ColumnWidth = 12

    ws.Activate
    ws.Range("B5").Select

    MsgBox "Tao sheet 'Tra Cuu' thanh cong!" & Chr(10) & Chr(10) & _
           "CACH DUNG:" & Chr(10) & _
           "1. Copy cot Ma HH tu file bao cao lenh" & Chr(10) & _
           "2. Paste vao cot B mau vang (tu B5 xuong)" & Chr(10) & _
           "3. Bam nut 'TIM KIEM TAT CA'" & Chr(10) & _
           "4. Cot 'SL Kiem' de trong - dien vao khi di kiem", _
           vbInformation, "Huong dan"
End Sub

' ============================================================
Sub TimKiemNhieuMa()
    Dim wsTC As Worksheet, wsData As Worksheet
    Dim i As Long, j As Long, stt As Long
    Dim lastRowData As Long
    Dim maTim As String, maCell As String
    Dim rowOut As Long

    On Error GoTo ErrHandler

    On Error Resume Next
    Set wsTC = ThisWorkbook.Sheets(SHEET_TRACUU)
    Set wsData = ThisWorkbook.Sheets(SHEET_DATA)
    On Error GoTo ErrHandler

    If wsTC Is Nothing Then
        MsgBox "Khong tim thay sheet '" & SHEET_TRACUU & "'!", vbCritical: Exit Sub
    End If
    If wsData Is Nothing Then
        MsgBox "Khong tim thay sheet '" & SHEET_DATA & "'!" & Chr(10) & _
               "Sua: Private Const SHEET_DATA = ""DemKho""", vbCritical: Exit Sub
    End If

    ' Doc danh sach ma, bo trung lap
    Dim dsMa(50) As String
    Dim soMa As Integer: soMa = 0
    For i = 5 To 54
        Dim maIn As String
        maIn = Trim(UCase(CStr(wsTC.Cells(i, 2).value)))
        If maIn <> "" Then
            Dim trung As Boolean: trung = False
            Dim k As Integer
            For k = 0 To soMa - 1
                If dsMa(k) = maIn Then trung = True: Exit For
            Next k
            If Not trung Then dsMa(soMa) = maIn: soMa = soMa + 1
        End If
    Next i

    If soMa = 0 Then
        MsgBox "Chua nhap ma nao! Paste ma hang vao cot B (tu B5 xuong).", vbExclamation
        wsTC.Range("B5").Select: Exit Sub
    End If

    Application.ScreenUpdating = False

    ' An dong trong trong vung nhap
    For i = 5 To 54
        wsTC.Rows(i).Hidden = (Trim(CStr(wsTC.Cells(i, 2).value)) = "")
    Next i

    ' Xoa ket qua cu
    wsTC.Range("A57:G10000").ClearContents
    wsTC.Range("A57:G10000").Interior.ColorIndex = xlNone
    wsTC.Range("A57:G10000").Borders.LineStyle = xlNone

    lastRowData = wsData.Cells(wsData.Rows.count, COL_MA).End(xlUp).Row
    rowOut = 56
    stt = 0

    For j = 0 To soMa - 1
        maTim = dsMa(j)
        Dim demViTri As Long: demViTri = 0

        For i = HEADER_ROW + 1 To lastRowData
            maCell = Trim(UCase(CStr(wsData.Cells(i, COL_MA).value)))
            If maCell = maTim Then
                rowOut = rowOut + 1
                demViTri = demViTri + 1
                stt = stt + 1

                Dim slVal As Double: slVal = 0
                If IsNumeric(wsData.Cells(i, COL_SL).value) Then
                    slVal = CDbl(wsData.Cells(i, COL_SL).value)
                End If

                wsTC.Cells(rowOut, 1).value = stt
                wsTC.Cells(rowOut, 2).value = wsData.Cells(i, COL_MA).value
                wsTC.Cells(rowOut, 3).value = wsData.Cells(i, COL_TEN).value
                wsTC.Cells(rowOut, 4).value = wsData.Cells(i, COL_DVT).value
                wsTC.Cells(rowOut, 5).value = wsData.Cells(i, COL_VITRI).value
                wsTC.Cells(rowOut, 6).value = wsData.Cells(i, COL_SL).value
                wsTC.Cells(rowOut, 7).value = ""

                ' Tat ca dong: nen trang, vien xam mong
                With wsTC.Range(wsTC.Cells(rowOut, 1), wsTC.Cells(rowOut, 7))
                    .Interior.ColorIndex = xlNone
                    .Borders.LineStyle = xlContinuous
                    .Borders.Color = RGB(200, 200, 200)
                    .Borders.Weight = xlThin
                End With

                wsTC.Cells(rowOut, 1).HorizontalAlignment = xlCenter
                wsTC.Cells(rowOut, 4).HorizontalAlignment = xlCenter
                wsTC.Cells(rowOut, 6).HorizontalAlignment = xlCenter
                wsTC.Cells(rowOut, 7).HorizontalAlignment = xlCenter
                wsTC.Rows(rowOut).RowHeight = 18
            End If
        Next i

        If demViTri = 0 Then
            rowOut = rowOut + 1
            wsTC.Cells(rowOut, 2).value = maTim
            wsTC.Cells(rowOut, 3).value = "Khong tim thay ma nay trong DemKho"
            wsTC.Cells(rowOut, 3).Font.Color = RGB(180, 0, 0)
            wsTC.Cells(rowOut, 3).Font.Italic = True
            With wsTC.Range(wsTC.Cells(rowOut, 1), wsTC.Cells(rowOut, 7))
                .Borders.LineStyle = xlContinuous
                .Borders.Color = RGB(200, 200, 200)
                .Borders.Weight = xlThin
            End With
            wsTC.Rows(rowOut).RowHeight = 18
        End If


    Next j

    Application.ScreenUpdating = True
    wsTC.Cells(57, 1).Select
    ActiveWindow.ScrollRow = 57

    MsgBox "Hoan tat! Tim thay " & stt & " vi tri cho " & soMa & " ma hang.", _
           vbInformation, "Ket qua"
    Exit Sub

ErrHandler:
    Application.ScreenUpdating = True
    MsgBox "Loi " & Err.Number & ": " & Err.Description, vbCritical, "Loi"
End Sub

' ============================================================
Sub XoaHet()
    On Error Resume Next
    Dim wsTC As Worksheet
    Set wsTC = ThisWorkbook.Sheets(SHEET_TRACUU)
    If wsTC Is Nothing Then Exit Sub
    wsTC.Rows("5:54").Hidden = False
    wsTC.Range("B5:B54").ClearContents
    wsTC.Range("A57:G10000").ClearContents
    wsTC.Range("A57:G10000").Interior.ColorIndex = xlNone
    wsTC.Range("A57:G10000").Borders.LineStyle = xlNone
    wsTC.Range("B5").Select
End Sub
