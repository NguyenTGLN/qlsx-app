Attribute VB_Name = "Module9"
Option Explicit

'=== TÌM SHEET KHÔNG PHÂN BI?T HOA/THU?NG ===
Private Function GetSheetCI(ByVal wanted As String) As Worksheet
    Dim ws As Worksheet, Target As String
    Target = UCase$(Trim$(wanted))
    For Each ws In ThisWorkbook.Worksheets
        If UCase$(Trim$(ws.Name)) = Target Then
            Set GetSheetCI = ws
            Exit Function
        End If
    Next ws
    Set GetSheetCI = Nothing
End Function

'=== CHU?N HÓA MÃ HÀNG ===
Private Function NormalizeSKU(ByVal s As Variant) As String
    Dim t As String
    t = CStr(s)
    t = WorksheetFunction.Clean(t)
    t = Replace(t, Chr(160), " ")
    t = Replace(t, vbTab, "")
    t = Trim$(t)
    Do While InStr(t, "  ") > 0
        t = Replace(t, "  ", " ")
    Loop
    t = Replace(t, "–", "-")
    t = Replace(t, "—", "-")
    t = Replace(t, "-", "-")
    t = UCase$(t)
    NormalizeSKU = t
End Function

'=== SO SÁNH KHÔNG PHÂN BI?T HOA/THU?NG ===
Private Function EqCI(ByVal a As Variant, ByVal b As String) As Boolean
    EqCI = (UCase$(Trim$(CStr(a))) = UCase$(Trim$(b)))
End Function

'=== L?Y S? C?T T? KÝ T? (VD: "C" -> 3) ===
Private Function ColIndex(ByVal ws As Worksheet, ByVal colSpec As String) As Long
    If Len(colSpec) = 0 Then
        ColIndex = 0
    ElseIf IsNumeric(colSpec) Then
        ColIndex = CLng(colSpec)
    Else
        ColIndex = ws.Columns(colSpec).Column
    End If
End Function

'=== C?NG D?N T? SHEET VÀO DICTIONARY ===
Private Sub AccumulateSheet(ByVal ws As Worksheet, _
                            ByVal startRow As Long, _
                            ByVal sign As Long, _
                            ByRef sumDict As Object, _
                            Optional ByVal colSKU As String = "C", _
                            Optional ByVal colQty As String = "E", _
                            Optional ByVal filterCol As String = "", _
                            Optional ByVal filterVal As String = "")
    If ws Is Nothing Then Exit Sub

    Dim cSKU As Long, cQty As Long, cFilter As Long
    cSKU = ColIndex(ws, colSKU)
    cQty = ColIndex(ws, colQty)
    cFilter = ColIndex(ws, filterCol)

    Dim lastRow As Long: lastRow = ws.Cells(ws.Rows.count, cSKU).End(xlUp).Row
    Dim data As Variant
    data = ws.Range(ws.Cells(startRow, 1), ws.Cells(lastRow, Application.WorksheetFunction.Max(cSKU, cQty, cFilter))).value

    Dim r As Long, key As String, rawMa As String, qty As Double
    For r = 1 To UBound(data, 1)
        Dim passFilter As Boolean
        If cFilter = 0 Then
            passFilter = True
        Else
            passFilter = EqCI(data(r, cFilter), filterVal)
        End If

        If passFilter Then
            rawMa = data(r, cSKU)
            key = NormalizeSKU(rawMa)
            If key <> "" Then
                qty = 0
                If Len(data(r, cQty)) > 0 Then qty = CDbl(Val(data(r, cQty)))
                If Not sumDict.exists(key) Then sumDict.Add key, 0
                sumDict(key) = sumDict(key) + sign * qty
            End If
        End If
    Next r
End Sub

'=== MAIN: PHIÊN B?N HOÀN CH?NH ===
Public Sub Build_CheckLech()
    Dim wsNhap As Worksheet, wsXuat As Worksheet, wsCK As Worksheet, wsDC As Worksheet
    Dim wsNhapSXTP As Worksheet, wsXuatSXLK As Worksheet
    Dim wsCheck As Worksheet, wsDem As Worksheet, wsDM As Worksheet
    Dim sumDict As Object, demDict As Object
    Dim lastRow As Long, i As Long, rawMa As String, key As String
    Dim checkData As Variant, resultArr() As Variant

    On Error GoTo SafeExit
    Application.ScreenUpdating = False
    Application.Calculation = xlCalculationManual
    Application.EnableEvents = False

    '=== L?y các sheet ===
    Set wsNhap = GetSheetCI("LuuNhap")
    Set wsXuat = GetSheetCI("LuuXuat")
    Set wsCK = GetSheetCI("LuuChuyenKho")
    Set wsDC = GetSheetCI("DieuChinhKho")
    Set wsNhapSXTP = GetSheetCI("LuuNhapSXTP")
    Set wsXuatSXLK = GetSheetCI("LuuXuatSXLK")
    Set wsCheck = GetSheetCI("CheckLech")
    Set wsDem = GetSheetCI("DemKho")
    Set wsDM = GetSheetCI("Danh Muc HH")

    If wsNhap Is Nothing Or wsXuat Is Nothing Or wsCK Is Nothing Or _
       wsDC Is Nothing Or wsCheck Is Nothing Or wsDM Is Nothing Then
        MsgBox "Thi?u 1 trong các sheet c?n thi?t.", vbExclamation
        GoTo SafeExit
    End If

    '=== Xóa & t?o header ===
    With wsCheck
        .Range("A:D").ClearContents
        .Range("A1:D1").value = Array("MSP", "TONKHO", "DEMKHO", "LECH")
    End With

    '=== Copy mã hàng t? Danh M?c HH (B3 xu?ng) ===
    lastRow = wsDM.Cells(wsDM.Rows.count, "B").End(xlUp).Row
    If lastRow < 3 Then
        MsgBox "Danh M?c HH không có mã t? dòng 3 tr? xu?ng.", vbExclamation
        GoTo SafeExit
    End If
    checkData = wsDM.Range("B3:B" & lastRow).value

    '=== Lo?i b? dòng tr?ng ? c?t A ===
    Dim cleanedData() As Variant
    Dim validCount As Long: validCount = 0
    ReDim cleanedData(1 To UBound(checkData), 1 To 1)
    For i = 1 To UBound(checkData)
        If Trim(checkData(i, 1)) <> "" Then
            validCount = validCount + 1
            cleanedData(validCount, 1) = checkData(i, 1)
        End If
    Next i
    If validCount = 0 Then
        MsgBox "Không có mã h?p l? trong Danh M?c HH!", vbExclamation
        GoTo SafeExit
    End If
    wsCheck.Range("A2").Resize(validCount, 1).value = cleanedData

    '=== T?o dictionary c?ng d?n ===
    Set sumDict = CreateObject("Scripting.Dictionary")
    Set demDict = CreateObject("Scripting.Dictionary")

    AccumulateSheet wsNhap, 2, 1, sumDict
    AccumulateSheet wsDC, 3, 1, sumDict
    AccumulateSheet wsXuat, 2, -1, sumDict
    AccumulateSheet wsCK, 2, -1, sumDict, "C", "E", "F", "Kho Chính"
    AccumulateSheet wsCK, 2, 1, sumDict, "C", "E", "G", "Kho Chính"
    AccumulateSheet wsNhapSXTP, 2, 1, sumDict
    AccumulateSheet wsXuatSXLK, 2, -1, sumDict

    '=== Ð?c DEM KHO (B:G) ===
    If Not wsDem Is Nothing Then
        Dim demData As Variant
        lastRow = wsDem.Cells(wsDem.Rows.count, "B").End(xlUp).Row
        If lastRow >= 2 Then
            demData = wsDem.Range("B2:G" & lastRow).value
            For i = 1 To UBound(demData)
                key = NormalizeSKU(demData(i, 1))
                If key <> "" Then
                    If Not demDict.exists(key) Then demDict.Add key, 0
                    demDict(key) = demDict(key) + Val(demData(i, 6))
                End If
            Next i
        End If
    End If

    '=== Tính toán k?t qu? ===
    ReDim resultArr(1 To validCount, 1 To 3)
    For i = 1 To validCount
    key = NormalizeSKU(cleanedData(i, 1))
    Dim bVal As Double, cVal As Double, lechVal As Double
    bVal = IIf(sumDict.exists(key), sumDict(key), 0)
    cVal = IIf(demDict.exists(key), demDict(key), 0)
    lechVal = cVal - bVal
    If Abs(lechVal) < 0.00005 Then lechVal = 0
    resultArr(i, 1) = bVal
    resultArr(i, 2) = cVal
    resultArr(i, 3) = Round(lechVal, 4)
Next i

    wsCheck.Range("B2").Resize(validCount, 3).value = resultArr

    '=== S?p x?p & L?c c?t D # 0 ===
    wsCheck.Range("A1:D" & validCount + 1).Sort Key1:=wsCheck.Range("A2"), Order1:=xlAscending, Header:=xlYes
    wsCheck.Columns("A:D").AutoFit
    wsCheck.AutoFilterMode = False
    wsCheck.Range("A1:D1").AutoFilter Field:=4, Criteria1:="<>0"

    MsgBox "XONG!", vbInformation

SafeExit:
    Application.ScreenUpdating = True
    Application.Calculation = xlCalculationAutomatic
    Application.EnableEvents = True
End Sub




