Attribute VB_Name = "Module7"
Option Explicit

'=== Tìm sheet theo tên (không phân bi?t hoa/thu?ng, b? kho?ng tr?ng du) ===
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

'=== Chu?n hoá mã hàng d? ghép/lo?i trùng ?n d?nh ===
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
    ' chu?n hoá các lo?i g?ch
    t = Replace(t, "–", "-")
    t = Replace(t, "—", "-")
    t = Replace(t, "-", "-")
    t = UCase$(t)
    NormalizeSKU = t
End Function

' So sánh b?ng nhau không phân bi?t hoa/thu?ng
Private Function EqCI(ByVal a As Variant, ByVal b As String) As Boolean
    EqCI = (UCase$(Trim$(CStr(a))) = UCase$(Trim$(b)))
End Function

' Chuy?n "C" ho?c "3" ? s? c?t th?c
Private Function ColIndex(ByVal ws As Worksheet, ByVal colSpec As String) As Long
    If Len(colSpec) = 0 Then
        ColIndex = 0
    ElseIf IsNumeric(colSpec) Then
        ColIndex = CLng(colSpec)
    Else
        ColIndex = ws.Columns(colSpec).Column
    End If
End Function

'=== C?ng d?n 1 sheet vào sumDict; có th? kèm di?u ki?n l?c theo c?t/giá tr? ===
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

    Dim lastRow As Long, r As Long, rawMa As String, key As String, qty As Double
    lastRow = ws.Cells(ws.Rows.count, cSKU).End(xlUp).Row

    For r = startRow To lastRow
        Dim passFilter As Boolean
        If cFilter = 0 Then
            passFilter = True
        Else
            passFilter = EqCI(ws.Cells(r, cFilter).value, filterVal)
        End If

        If passFilter Then
            rawMa = ws.Cells(r, cSKU).value
            key = NormalizeSKU(rawMa)
            If key <> "" Then
                qty = 0
                If Len(ws.Cells(r, cQty).value) > 0 Then qty = CDbl(Val(ws.Cells(r, cQty).value))
                If Not sumDict.exists(key) Then sumDict.Add key, 0
                sumDict(key) = sumDict(key) + sign * qty
            End If
        End If
    Next r
End Sub

'=== MAIN: Copy mã t? Danh Muc HH và tính B, C, D theo công th?c t?n m?i ===
Public Sub Build_CheckLech_Inventory_FromDMHH()
    Dim wsNhap As Worksheet, wsXuat As Worksheet, wsCK As Worksheet, wsDC As Worksheet
    Dim wsNhapSXTP As Worksheet, wsXuatSXLK As Worksheet
    Dim wsCheck As Worksheet, wsDem As Worksheet, wsDM As Worksheet
    Dim sumDict As Object, demDict As Object
    Dim lastRow As Long, r As Long, i As Long
    Dim rawMa As String, key As String

    ' L?y sheet
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
        MsgBox "Thi?u 1 trong các sheet: LuuNhap, LuuXuat, LuuChuyenKho, DieuChinhKho, CheckLech, Danh Muc HH.", vbExclamation
        Exit Sub
    End If

    ' Header CheckLech
    wsCheck.Range("A:D").ClearContents
    wsCheck.[A1] = "MÃ HÀNG"
    wsCheck.[B1] = "SL TÍNH (NH?P + ÐI?U CH?NH - XU?T - CK(F=Kho Chính) + CK(G=Kho Chính) + NH?P SXTP - XU?T SXLK)"
    wsCheck.[C1] = "SL Ð?M KHO (DemKho)"
    wsCheck.[D1] = "CHÊNH L?CH (B - C)"

    ' 1) Copy mã t? Danh Muc HH!B3:B(last) -> CheckLech!A2:A...
    lastRow = wsDM.Cells(wsDM.Rows.count, "B").End(xlUp).Row
    If lastRow < 3 Then
        MsgBox "Danh Muc HH không có mã t? B3 tr? xu?ng.", vbExclamation
        Exit Sub
    End If
    Dim src As Variant
    src = wsDM.Range("B3:B" & lastRow).value  ' m?ng 2D
    wsCheck.Range("A2").Resize(UBound(src, 1), 1).value = src

    ' 2) Tính t?ng t?n theo công th?c m?i
    Set sumDict = CreateObject("Scripting.Dictionary")
    Set demDict = CreateObject("Scripting.Dictionary")

    ' LuuNhap (+), DieuChinhKho (+), LuuXuat (-)
    AccumulateSheet wsNhap, 2, 1, sumDict, "C", "E"
    AccumulateSheet wsDC, 3, 1, sumDict, "C", "E"         ' sheet này header d?n dòng 2
    AccumulateSheet wsXuat, 2, -1, sumDict, "C", "E"

    ' LuuChuyenKho:
    '   - Tr? khi F="Kho Chính" (xu?t kh?i Kho Chính)
    '   - C?ng khi G="Kho Chính" (nh?p v? Kho Chính)
    AccumulateSheet wsCK, 2, -1, sumDict, "C", "E", "F", "Kho Chính"
    AccumulateSheet wsCK, 2, 1, sumDict, "C", "E", "G", "Kho Chính"

    ' S?n xu?t: Nh?p SXTP (+), Xu?t SXLK (-)
    AccumulateSheet wsNhapSXTP, 2, 1, sumDict, "C", "E"
    AccumulateSheet wsXuatSXLK, 2, -1, sumDict, "C", "E"

    ' DemKho (B: mã, G: SL)
    If Not wsDem Is Nothing Then
        lastRow = wsDem.Cells(wsDem.Rows.count, "B").End(xlUp).Row
        For r = 2 To lastRow
            rawMa = wsDem.Cells(r, "B").value
            key = NormalizeSKU(rawMa)
            If key <> "" Then
                Dim dq As Double: dq = 0
                If Len(wsDem.Cells(r, "G").value) > 0 Then dq = CDbl(Val(wsDem.Cells(r, "G").value))
                If Not demDict.exists(key) Then demDict.Add key, 0
                demDict(key) = demDict(key) + dq
            End If
        Next r
    End If

    ' 3) Ghi B, C, D theo danh sách mã dã dán ? c?t A
    Dim lastCheck As Long
    lastCheck = wsCheck.Cells(wsCheck.Rows.count, "A").End(xlUp).Row
    For i = 2 To lastCheck
        rawMa = wsCheck.Cells(i, "A").value
        key = NormalizeSKU(rawMa)
        Dim bVal As Double, cVal As Double
        bVal = IIf(sumDict.exists(key), sumDict(key), 0)
        cVal = IIf(demDict.exists(key), demDict(key), 0)
        wsCheck.Cells(i, "B").value = bVal
        wsCheck.Cells(i, "C").value = cVal
        wsCheck.Cells(i, "D").value = cVal - bVal
    Next i

    ' Hoàn thi?n
    If lastCheck > 3 Then wsCheck.Range("A1:D" & lastCheck).Sort Key1:=wsCheck.Range("A2"), Order1:=xlAscending, Header:=xlYes
    wsCheck.Columns("A:D").AutoFit

    MsgBox "? Xong: Copy mã t? 'Danh Muc HH' và tính B, C, D theo công th?c t?n m?i.", vbInformation
End Sub




