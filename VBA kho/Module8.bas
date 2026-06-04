Attribute VB_Name = "Module8"
'=== Helper: ??y m?t record debug vào sheet ===
Private Sub DebugPush(ByVal wsOut As Worksheet, ByRef rowOut As Long, _
                      ByVal src As String, ByVal r As Long, _
                      ByVal rawSKU As String, ByVal normSKU As String, _
                      ByVal qty As Double, ByVal sign As Long, _
                      ByVal colF As Variant, ByVal colG As Variant, _
                      ByVal targetRaw As String)
    With wsOut
        .Cells(rowOut, 1).value = src
        .Cells(rowOut, 2).value = r
        .Cells(rowOut, 3).value = rawSKU
        .Cells(rowOut, 4).value = normSKU
        .Cells(rowOut, 5).value = qty
        .Cells(rowOut, 6).value = sign
        .Cells(rowOut, 7).value = colF
        .Cells(rowOut, 8).value = colG
        .Cells(rowOut, 9).value = IIf(rawSKU = targetRaw, "Yes", "No") ' Match SUMIFS?
    End With
    rowOut = rowOut + 1
End Sub

'=== DEBUG: li?t kê chi ti?t ?óng góp c?a m?t mã (ô ?ang ch?n ? CheckLech!A) ===
Public Sub Debug_Breakdown_For_ActiveSKU()
    Dim wsCheck As Worksheet, targetCell As Range, targetRaw As String, targetNorm As String
    Set wsCheck = GetSheetCI("CheckLech")
    If wsCheck Is Nothing Then MsgBox "Không th?y sheet CheckLech.", vbExclamation: Exit Sub

    Set targetCell = ActiveCell
    If targetCell.Parent.Name <> wsCheck.Name Or targetCell.Column <> 1 Or targetCell.Row < 2 Then
        MsgBox "Hãy ch?n ô mã hàng ? c?t A (t? dòng 2) c?a CheckLech r?i ch?y l?i.", vbInformation
        Exit Sub
    End If

    targetRaw = CStr(targetCell.value)
    targetNorm = NormalizeSKU(targetRaw)

    ' T?o sheet DEBUG
    Application.DisplayAlerts = False
    On Error Resume Next: Worksheets("DEBUG_SKU").Delete: On Error GoTo 0
    Application.DisplayAlerts = True
    Dim wsOut As Worksheet: Set wsOut = Worksheets.Add
    wsOut.Name = "DEBUG_SKU"
    wsOut.Range("A1:I1").value = Array("Source", "Row", "Raw SKU", "Norm SKU", "Qty", "Sign", "F", "G", "Match_SUMIFS?")
    Dim rOut As Long: rOut = 2

    ' Macro n?i b? quét 1 sheet theo ?i?u ki?n l?c (n?u có)
    Dim Procedure As Variant
    Procedure = Array( _
        Array("LuuNhap", 2, 1, "C", "E", "", ""), _
        Array("DieuChinhKho", 3, 1, "C", "E", "", ""), _
        Array("LuuXuat", 2, -1, "C", "E", "", ""), _
        Array("LuuChuyenKho", 2, -1, "C", "E", "F", "Kho Chính"), _
        Array("LuuChuyenKho", 2, 1, "C", "E", "G", "Kho Chính"), _
        Array("LuuNhapSXTP", 2, 1, "C", "E", "", ""), _
        Array("LuuXuatSXLK", 2, -1, "C", "E", "", "") _
    )

    Dim i As Long
    For i = LBound(Procedure) To UBound(Procedure)
        Dim sName As String, startRow As Long, sign As Long, cSKU As String, cQty As String, fCol As String, fVal As String
        sName = Procedure(i)(0): startRow = Procedure(i)(1): sign = Procedure(i)(2)
        cSKU = Procedure(i)(3): cQty = Procedure(i)(4): fCol = Procedure(i)(5): fVal = Procedure(i)(6)
        Dim ws As Worksheet: Set ws = GetSheetCI(sName)
        If Not ws Is Nothing Then
            Dim cSKUidx As Long, cQtyidx As Long, cFidx As Long
            cSKUidx = ColIndex(ws, cSKU): cQtyidx = ColIndex(ws, cQty): cFidx = ColIndex(ws, fCol)
            Dim lastRow As Long: lastRow = ws.Cells(ws.Rows.count, cSKUidx).End(xlUp).Row
            Dim r As Long, raw As String, norm As String, passF As Boolean, q As Double
            For r = startRow To lastRow
                passF = (cFidx = 0) Or EqCI(ws.Cells(r, cFidx).value, fVal)
                If passF Then
                    raw = CStr(ws.Cells(r, cSKUidx).value)
                    norm = NormalizeSKU(raw)
                    If norm = targetNorm Then
                        q = GetNumeric(ws.Cells(r, cQtyidx).value)
                        DebugPush wsOut, rOut, sName, r, raw, norm, q, sign, ws.Cells(r, ColIndex(ws, "F")).value, ws.Cells(r, ColIndex(ws, "G")).value, targetRaw
                    End If
                End If
            Next r
        End If
    Next i

    wsOut.Columns("A:I").AutoFit
    MsgBox "?ã t?o b?ng phân tích ? sheet DEBUG_SKU. L?c c?t 'Match_SUMIFS?' = No ?? th?y các dòng code tính nh?ng SUMIFS b? qua.", vbInformation
End Sub


