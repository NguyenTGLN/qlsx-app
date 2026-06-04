Attribute VB_Name = "Module10"
Sub GopMaHang_CoBackup()

    ' ======= C?U HÌNH =======
    Dim TEN_SHEET As String
    TEN_SHEET = "DemKho"   ' << Ð?i tên sheet n?u khác
    Dim DONG_HEADER As Long: DONG_HEADER = 2   ' Dòng tiêu d?
    Dim COL_MA    As Long:   COL_MA = 2        ' C?t B - Mã HH
    Dim COL_VITRI As Long:   COL_VITRI = 5     ' C?t E - V? trí
    Dim COL_SL    As Long:   COL_SL = 7        ' C?t G - SL
    ' =========================

    Application.ScreenUpdating = False
    Application.Calculation = xlCalculationManual

    Dim ws As Worksheet
    Set ws = ThisWorkbook.Sheets(TEN_SHEET)

    ' -- BU?C 1: T?O BACKUP ------------------------------
    Dim tenBackup As String
    tenBackup = "_Backup_" & TEN_SHEET

    ' Xóa backup cu n?u có
    ' Xóa backup cu n?u có
Dim sh As Worksheet
Dim j As Integer
For j = ThisWorkbook.Sheets.count To 1 Step -1
    If ThisWorkbook.Sheets(j).Name = tenBackup Then
        Application.DisplayAlerts = False
        ThisWorkbook.Sheets(j).Delete
        Application.DisplayAlerts = True
        Exit For
    End If
Next j

' Copy sheet g?c sang sheet backup
    ' Copy sheet g?c sang sheet backup
    ws.Copy After:=ws
    Dim wsBk As Worksheet
    Set wsBk = ThisWorkbook.Sheets(TEN_SHEET & " (2)")
    wsBk.Name = tenBackup
    wsBk.Visible = xlSheetHidden  ' ?n di

    MsgBox "? Ðã backup xong! B?t d?u g?p mã hàng...", vbInformation, "Thông báo"

    ' -- BU?C 2: Ð?C D? LI?U VÀO M?NG ------------------
    Dim lastRow As Long
    lastRow = ws.Cells(ws.Rows.count, COL_MA).End(xlUp).Row

    ' Dùng Dictionary d? gom nhóm
    Dim dict As Object
    Set dict = CreateObject("Scripting.Dictionary")

    ' dictRow luu dòng Excel d?u tiên c?a m?i nhóm
    Dim dictRow As Object
    Set dictRow = CreateObject("Scripting.Dictionary")

    Dim i As Long
    For i = DONG_HEADER + 1 To lastRow
        Dim ma As String
        ma = Trim(CStr(ws.Cells(i, COL_MA).value))
        If ma = "" Then GoTo TiepTheo

        Dim vitri As String
        vitri = Trim(CStr(ws.Cells(i, COL_VITRI).value))

        Dim key As String
        key = ma & "|||" & vitri

        Dim sl As Double
        sl = Val(ws.Cells(i, COL_SL).value)

        If dict.exists(key) Then
            ' C?ng d?n SL vào t?ng
            dict(key) = dict(key) + sl
        Else
            ' L?n d?u g?p: luu SL và s? dòng Excel
            dict(key) = sl
            dictRow(key) = i
        End If
TiepTheo:
    Next i

    ' -- BU?C 3: C?P NH?T SL TRÊN DÒNG GI? L?I ---------
    Dim k As Variant
    For Each k In dict.Keys
        Dim dongGiu As Long
        dongGiu = dictRow(k)
        ws.Cells(dongGiu, COL_SL).value = dict(k)
    Next k

    ' -- BU?C 4: XÓA DÒNG TRÙNG (t? du?i lên) -----------
    ' Ðánh d?u dòng c?n xóa
    Dim seen As Object
    Set seen = CreateObject("Scripting.Dictionary")

    Dim rowsToDelete() As Long
    Dim countDel As Long: countDel = 0
    ReDim rowsToDelete(1 To lastRow)

    For i = DONG_HEADER + 1 To lastRow
        ma = Trim(CStr(ws.Cells(i, COL_MA).value))
        If ma = "" Then GoTo TiepTheo2
        vitri = Trim(CStr(ws.Cells(i, COL_VITRI).value))
        key = ma & "|||" & vitri

        If seen.exists(key) Then
            ' Dòng trùng ? dánh d?u xóa
            countDel = countDel + 1
            rowsToDelete(countDel) = i
        Else
            seen(key) = 1
        End If
TiepTheo2:
    Next i

    ' Xóa t? du?i lên (d? không b? l?ch s? dòng)
    For i = countDel To 1 Step -1
        ws.Rows(rowsToDelete(i)).Delete
    Next i

    ' -- HOÀN T?T ----------------------------------------
    Application.ScreenUpdating = True
    Application.Calculation = xlCalculationAutomatic

    MsgBox "? HOÀN T?T!" & Chr(10) & _
           "• Ðã xóa " & countDel & " dòng trùng" & Chr(10) & _
           "• Backup an toàn trong sheet ?n '" & tenBackup & "'" & Chr(10) & Chr(10) & _
           "Ð? khôi ph?c: chu?t ph?i vào tab sheet ? Unhide ? ch?n " & tenBackup, _
           vbInformation, "G?p Mã Hàng"

End Sub

