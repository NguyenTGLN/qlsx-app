Attribute VB_Name = "Module2"
Sub VeSheetKHbanSale()
Dim ws_KHbanSale As Worksheet
Set ws_KHbanSale = ThisWorkbook.Sheets("KHbanSale")
ws_KHbanSale.Activate
ws_KHbanSale.Range("A1").Select
End Sub
Sub DatLinhKienTheoKeHoachBan()

Application.ScreenUpdating = False
EventState = Application.EnableEvents
Application.EnableEvents = False
CalcState = Application.Calculation
Application.Calculation = xlCalculationAutomatic
PageBreakState = ActiveSheet.DisplayPageBreaks
ActiveSheet.DisplayPageBreaks = False

On erro GoTo 3

Call TonKho
Application.ScreenUpdating = False
EventState = Application.EnableEvents
Application.EnableEvents = False
CalcState = Application.Calculation
Application.Calculation = xlCalculationAutomatic
PageBreakState = ActiveSheet.DisplayPageBreaks
ActiveSheet.DisplayPageBreaks = False

Dim ws_KHbanSale, ws_LuuXuat, ws_LuuChuyenKho, ws_LuuNhap, ws_LyDoXN, ws_DanhMucHH, ws_DieuChinhKho As Worksheet
Dim startRow_DuBaoSX, lastRow_DuBaoSX As Double
Dim startRow_DanhMucHH, lastRow_DanhMucHH As Double
Set ws_KHbanSale = ThisWorkbook.Sheets("KHbanSale")
Set ws_LuuXuat = ThisWorkbook.Sheets("LuuXuat")
Set ws_LuuNhap = ThisWorkbook.Sheets("LuuNhap")
Set ws_DanhMucHH = ThisWorkbook.Sheets("Danh Muc HH")
Set ws_LuuXuatSXLK = ThisWorkbook.Sheets("LuuXuatSXLK")
Set ws_LuuNhapSXTP = ThisWorkbook.Sheets("LuuNhapSXTP")
Set ws_LuuChuyenKho = ThisWorkbook.Sheets("LuuChuyenKho")
Set ws_DieuChinhKho = ThisWorkbook.Sheets("DieuChinhKho")
Set ws_LyDoXN = ThisWorkbook.Sheets("LyDoXN")
Set ws_DuBaoSX = ThisWorkbook.Sheets("DuBaoSX")
Dim m, SLDaNhap, SLDaNhapCK, SLDaNhapSXTP, TongSLDaNhap As Double
Dim SLDaXuat, SLDaXuatCK, SLDaXuatSXLK, TongSLDaXuat As Double
Dim SLNhap_TK, SLNhapCK_TK, SLNhapSXTP_TK, TongSLNhap_TK As Double
Dim SLXuat_TK, SLXuatCK_TK, SLXuatSXTP_TK, TongSLXuat_TK As Double
Dim SLDauKy, SLKhoCon, SLDieuChinh As Double
Dim NgayDauThang, NgayCuoiThang As Double
Dim SLBanTT, SoNgayTon As Double
Dim NgayCuoiTT, NgayDauTT As Double
Dim DH As Double
Dim ws_KHXuatLK As Worksheet
Set ws_KHXuatLK = ThisWorkbook.Sheets("KHXuatLK")
Dim ws_LKCoiSP As Worksheet
Set ws_LKCoiSP = ThisWorkbook.Sheets("LKCoiSP")

Dim ws_TonKho As Worksheet
Set ws_TonKho = ThisWorkbook.Sheets("TonKho")

Dim ws_KHSPNhan As Worksheet
Set ws_KHSPNhan = ThisWorkbook.Sheets("KHSPNhan")
Dim ws_CumCoiSp As Worksheet
Set ws_CumCoiSp = ThisWorkbook.Sheets("CumCoiSp")
Set ws_DuBaoSX = ThisWorkbook.Sheets("DuBaoSX")
Dim ws_LichSX As Worksheet
Set ws_LichSX = ThisWorkbook.Sheets("LichSX")
Dim ws_Phieu_NL, ws_InBOM, ws_BOM, ws_DMHH As Worksheet
Dim startRow_BOM, lastRow_BOM, startRow_InBOM, lastRow_InBOM As Double
Set ws_Phieu_NL = ThisWorkbook.Sheets("Phieu NL")
Set ws_InBOM = ThisWorkbook.Sheets("InBOM")
Set ws_BOM = ThisWorkbook.Sheets("BOM")
Set ws_DMHH = ThisWorkbook.Sheets("Danh Muc HH")


Dim startRow_LichSX, lastRow_LichSX As Double
Dim startRow_KHXuatLK, lastRow_KHXuatLK, lastRow_KHSPNhan As Double

Dim i As Double

Dim ws_DatLKTheoBanHang As Worksheet

Dim startRow_DatLKTheoBanHang, lastRow_DatLKTheoBanHang, lastRow_KHbanSale As Double


Set ws_LuuXuat = ThisWorkbook.Sheets("LuuXuat")
Set ws_LuuNhap = ThisWorkbook.Sheets("LuuNhap")
Set ws_DanhMucHH = ThisWorkbook.Sheets("Danh Muc HH")
Set ws_LuuXuatSXLK = ThisWorkbook.Sheets("LuuXuatSXLK")
Set ws_LuuNhapSXTP = ThisWorkbook.Sheets("LuuNhapSXTP")
Set ws_LuuChuyenKho = ThisWorkbook.Sheets("LuuChuyenKho")
Set ws_DatLKTheoBanHang = ThisWorkbook.Sheets("DatLKTheoBanHang")
Set ws_DieuChinhKho = ThisWorkbook.Sheets("DieuChinhKho")
Set ws_LyDoXN = ThisWorkbook.Sheets("LyDoXN")


NgayCuoiThang = Excel.WorksheetFunction.EoMonth(Date, 0)
NgayDauThang = Excel.WorksheetFunction.EoMonth(Date, -1) + 1
NgayCuoiTT = Excel.WorksheetFunction.EoMonth(Date, -1)
NgayDauTT = Excel.WorksheetFunction.EoMonth(Date, -2) + 1
startRow_DanhMucHH = 2
lastRow_DanhMucHH = Excel.WorksheetFunction.CountA(ws_DanhMucHH.Range("B:B")) + startRow_DanhMucHH - 2

startRow_DuBaoSX = 2
With Sheets("DuBaoSX")
    If .FilterMode Then .AutoFilterMode = False
End With
ws_DuBaoSX.Range("D1") = NgayDauThang
a = ws_DuBaoSX.Range("D1").value
ws_DuBaoSX.Range("G1") = NgayCuoiThang
b = ws_DuBaoSX.Range("G1").value
                    
ws_DuBaoSX.Rows("3:1048576").Delete
                    

lastRow_KHbanSale = Excel.WorksheetFunction.CountA(ws_KHbanSale.Range("B:B"))
Set targetRange = ws_KHbanSale.Range("B2:B" & lastRow_KHbanSale)
    For Each cell In targetRange
        If Not IsEmpty(cell.value) Then
            cell.value = UCase(cell.value)
        End If
    Next cell
    
ws_KHbanSale.Range("B" & 2 & ":C" & lastRow_KHbanSale).Copy
ws_DuBaoSX.Range("B3").PasteSpecial Paste:=xlPasteValues, Operation:=xlNone, SkipBlanks:=False, Transpose:=False
Application.CutCopyMode = False

ws_KHbanSale.Range("D" & 2 & ":D" & lastRow_KHbanSale).Copy
ws_DuBaoSX.Range("H3").PasteSpecial Paste:=xlPasteValues, Operation:=xlNone, SkipBlanks:=False, Transpose:=False
Application.CutCopyMode = False

With ws_KHXuatLK
    If .FilterMode Then .AutoFilterMode = False
End With
lastRow_DuBaoSX = Excel.WorksheetFunction.CountA(ws_DuBaoSX.Range("B:B")) + startRow_DuBaoSX - 1
ws_KHXuatLK.Rows("3:1048576").Delete


With ws_KHSPNhan
    If .FilterMode Then .AutoFilterMode = False
End With

ws_KHSPNhan.Rows("3:1048576").Delete


With Sheets("LichSX")
    If .FilterMode Then .AutoFilterMode = False
End With

ws_LichSX.Rows("3:1048576").Delete
startRow_DuBaoSX = 2
lastRow_DuBaoSX = Excel.WorksheetFunction.CountA(ws_DuBaoSX.Range("B:B")) + startRow_DuBaoSX - 2
startRow_LichSX = 2
lastRow_LichSX = Excel.WorksheetFunction.CountA(ws_LichSX.Range("B:B")) + startRow_LichSX - 2

        For i = (startRow_DuBaoSX + 1) To lastRow_DuBaoSX
            If Excel.WorksheetFunction.CountIf(Sheets("BOM").Range("A:A"), ws_DuBaoSX.Range("B" & i)) > 0 Then
            ws_LichSX.Range("B" & (lastRow_LichSX + 1)) = Date
            ws_DuBaoSX.Range("B" & i & ":C" & i).Copy
            ws_LichSX.Range("C" & (lastRow_LichSX + 1)).PasteSpecial Paste:=xlPasteValues, Operation:=xlNone, SkipBlanks _
                    :=False, Transpose:=False
            Application.CutCopyMode = False
            ws_DuBaoSX.Range("H" & i).Copy
            ws_LichSX.Range("E" & (lastRow_LichSX + 1)).PasteSpecial Paste:=xlPasteValues, Operation:=xlNone, SkipBlanks _
                    :=False, Transpose:=False
             Application.CutCopyMode = False
            ws_LichSX.Range("F" & (lastRow_LichSX + 1)) = ws_LichSX.Range("F1")
            lastRow_LichSX = Excel.WorksheetFunction.CountA(ws_LichSX.Range("B:B")) + startRow_LichSX - 2
            End If
        Next i
lastRow_KHSPNhan = Excel.WorksheetFunction.CountA(ws_KHSPNhan.Range("B:B"))
If ws_LichSX.Range("B" & 3) <> "" Then
ws_LichSX.Range("B" & 3 & ":F" & lastRow_LichSX).Copy Destination:=ws_KHSPNhan.Range("B" & lastRow_KHSPNhan + 1)
End If



With Sheets("Phieu NL")
    If .FilterMode Then .AutoFilterMode = False
End With
ws_Phieu_NL.Rows("5:1048576").Delete

startRow_Phieu_NL = 4
lastRow_LichSX = Excel.WorksheetFunction.CountA(ws_LichSX.Range("B:B")) + startRow_LichSX - 2
lastRow_Phieu_NL = Excel.WorksheetFunction.CountA(ws_Phieu_NL.Range("B:B")) + startRow_Phieu_NL - 2

If lastRow_LichSX > startRow_LichSX + 1 Then
ws_LichSX.Range("B" & startRow_LichSX + 1 & ":E" & lastRow_LichSX).Copy
ws_Phieu_NL.Range("B" & lastRow_Phieu_NL).PasteSpecial xlPasteValues
Application.CutCopyMode = False
lastRow_Phieu_NL = Excel.WorksheetFunction.CountA(ws_Phieu_NL.Range("B:B")) + startRow_Phieu_NL - 2
ws_Phieu_NL.Range("B" & startRow_Phieu_NL + 1 & ":B" & lastRow_Phieu_NL - 1).NumberFormat = "[$-101042A]d mmmm yyyy;@"
ws_Phieu_NL.Range("B" & startRow_Phieu_NL & ":E" & lastRow_Phieu_NL - 1).Borders.LineStyle = xlContinuous



Sheets("TieuDe").Range("C6:F7").Copy Destination:=ws_Phieu_NL.Range("B" & lastRow_Phieu_NL + 1)

Dim PNL As Double
 PNL = lastRow_Phieu_NL + 3

Dim j, k, h As Integer
For j = startRow_LichSX + 1 To lastRow_LichSX Step 1

   ws_LichSX.Range("C" & j).Copy
   ws_InBOM.Range("B4").PasteSpecial xlPasteValues
    Application.CutCopyMode = False

    Call XuatBOM

Application.ScreenUpdating = False
EventState = Application.EnableEvents
Application.EnableEvents = False
CalcState = Application.Calculation
Application.Calculation = xlCalculationAutomatic
PageBreakState = ActiveSheet.DisplayPageBreaks
ActiveSheet.DisplayPageBreaks = False

    lastRow_InBOM = Excel.WorksheetFunction.CountA(ws_InBOM.Range("A:A"))
    startRow_InBOM = 6
                For k = startRow_InBOM To lastRow_InBOM Step 1
                 For h = PNL To lastRow_Phieu_NL + 3 Step 1
                     If ws_InBOM.Range("A" & k).value = ws_Phieu_NL.Range("B" & h) Then
                        Dim TamLuu As Double
                        TamLuu = ws_Phieu_NL.Range("E" & h)
                        ws_Phieu_NL.Range("E" & h) = TamLuu + ws_InBOM.Range("D" & k) * ws_LichSX.Range("E" & j)
                        GoTo 1
                       End If
                       Next h


                        ws_InBOM.Range("A" & k & ":D" & k).Copy ws_Phieu_NL.Range("B" & lastRow_Phieu_NL + 3)


                        ws_Phieu_NL.Range("E" & lastRow_Phieu_NL + 3) = ws_InBOM.Range("D" & k) * ws_LichSX.Range("E" & j)

               lastRow_Phieu_NL = lastRow_Phieu_NL + 1
1                Next k
        Next j

ws_Phieu_NL.Range("B" & PNL - 1 & ":E" & lastRow_Phieu_NL + 2).Sort Key1:=ws_Phieu_NL.Range("B" & PNL - 1 & ":B" & lastRow_Phieu_NL + 2), Order1:=xlAscending, Header:=xlYes


lastRow_KHXuatLK = Excel.WorksheetFunction.CountA(ws_KHXuatLK.Range("C:C")) + 1
startRow_KHXuatLK = Excel.WorksheetFunction.CountA(ws_KHXuatLK.Range("B:B"))
ws_Phieu_NL.Range("B" & PNL & ":C" & lastRow_Phieu_NL + 2).Copy
ws_KHXuatLK.Range("C" & lastRow_KHXuatLK + 1).PasteSpecial Paste:=xlPasteValues
        Application.CutCopyMode = False

ws_Phieu_NL.Range("E" & PNL & ":E" & lastRow_Phieu_NL + 2).Copy
ws_KHXuatLK.Range("E" & lastRow_KHXuatLK + 1).PasteSpecial Paste:=xlPasteValues
        Application.CutCopyMode = False

lastRow_KHXuatLK = Excel.WorksheetFunction.CountA(ws_KHXuatLK.Range("C:C")) + 1

ws_Phieu_NL.Range("B5").Copy
ws_KHXuatLK.Range("B" & startRow_KHXuatLK + 1 & ":B" & lastRow_KHXuatLK).PasteSpecial Paste:=xlPasteValues
        Application.CutCopyMode = False

ws_Phieu_NL.Range("D3").Copy
ws_KHXuatLK.Range("F" & startRow_KHXuatLK + 1 & ":F" & lastRow_KHXuatLK).PasteSpecial Paste:=xlPasteValues
        Application.CutCopyMode = False
End If



Dim Start As Integer
Start = 3
Dim t As Integer
For t = 1 To 5

With Sheets("LichSX")
    If .FilterMode Then .AutoFilterMode = False
End With

ws_LichSX.Rows("3:1048576").Delete
lastRow_KHXuatLK = Excel.WorksheetFunction.CountA(ws_KHXuatLK.Range("B:B"))
startRow_LichSX = 2
lastRow_LichSX = Excel.WorksheetFunction.CountA(ws_LichSX.Range("B:B")) + startRow_LichSX - 2

        For i = Start To lastRow_KHXuatLK
            If Excel.WorksheetFunction.CountIf(Sheets("BOM").Range("A:A"), ws_KHXuatLK.Range("C" & i)) > 0 Then
            ws_KHXuatLK.Range("B" & i & ":F" & i).Copy
            ws_LichSX.Range("B" & (lastRow_LichSX + 1)).PasteSpecial Paste:=xlPasteValues, Operation:=xlNone, SkipBlanks _
                    :=False, Transpose:=False
            Application.CutCopyMode = False

            lastRow_LichSX = Excel.WorksheetFunction.CountA(ws_LichSX.Range("B:B")) + startRow_LichSX - 2
            End If
        Next i
Start = lastRow_KHXuatLK + 1
lastRow_KHSPNhan = Excel.WorksheetFunction.CountA(ws_KHSPNhan.Range("B:B"))

If ws_LichSX.Range("B" & 3) <> "" Then
ws_LichSX.Range("B" & 3 & ":F" & lastRow_LichSX).Copy Destination:=ws_KHSPNhan.Range("B" & lastRow_KHSPNhan + 1)
End If

With Sheets("Phieu NL")
    If .FilterMode Then .AutoFilterMode = False
End With
ws_Phieu_NL.Rows("5:1048576").Delete

startRow_Phieu_NL = 4
lastRow_LichSX = Excel.WorksheetFunction.CountA(ws_LichSX.Range("B:B")) + startRow_LichSX - 2
lastRow_Phieu_NL = Excel.WorksheetFunction.CountA(ws_Phieu_NL.Range("B:B")) + startRow_Phieu_NL - 2

If lastRow_LichSX > startRow_LichSX + 1 Then
ws_LichSX.Range("B" & startRow_LichSX + 1 & ":E" & lastRow_LichSX).Copy
ws_Phieu_NL.Range("B" & lastRow_Phieu_NL).PasteSpecial xlPasteValues
Application.CutCopyMode = False
lastRow_Phieu_NL = Excel.WorksheetFunction.CountA(ws_Phieu_NL.Range("B:B")) + startRow_Phieu_NL - 2
ws_Phieu_NL.Range("B" & startRow_Phieu_NL + 1 & ":B" & lastRow_Phieu_NL - 1).NumberFormat = "[$-101042A]d mmmm yyyy;@"
ws_Phieu_NL.Range("B" & startRow_Phieu_NL & ":E" & lastRow_Phieu_NL - 1).Borders.LineStyle = xlContinuous



Sheets("TieuDe").Range("C6:F7").Copy Destination:=ws_Phieu_NL.Range("B" & lastRow_Phieu_NL + 1)


 PNL = lastRow_Phieu_NL + 3


For j = startRow_LichSX + 1 To lastRow_LichSX Step 1

   ws_LichSX.Range("C" & j).Copy
   ws_InBOM.Range("B4").PasteSpecial xlPasteValues
    Application.CutCopyMode = False

    Call XuatBOM

    Application.ScreenUpdating = False
EventState = Application.EnableEvents
Application.EnableEvents = False
CalcState = Application.Calculation
Application.Calculation = xlCalculationAutomatic
PageBreakState = ActiveSheet.DisplayPageBreaks
ActiveSheet.DisplayPageBreaks = False


    lastRow_InBOM = Excel.WorksheetFunction.CountA(ws_InBOM.Range("A:A"))
    startRow_InBOM = 6
                For k = startRow_InBOM To lastRow_InBOM Step 1
                 For h = PNL To lastRow_Phieu_NL + 3 Step 1
                     If ws_InBOM.Range("A" & k).value = ws_Phieu_NL.Range("B" & h) Then

                        TamLuu = ws_Phieu_NL.Range("E" & h)
                        ws_Phieu_NL.Range("E" & h) = TamLuu + ws_InBOM.Range("D" & k) * ws_LichSX.Range("E" & j)
                        GoTo 2
                       End If
                       Next h


                        ws_InBOM.Range("A" & k & ":D" & k).Copy ws_Phieu_NL.Range("B" & lastRow_Phieu_NL + 3)


                        ws_Phieu_NL.Range("E" & lastRow_Phieu_NL + 3) = ws_InBOM.Range("D" & k) * ws_LichSX.Range("E" & j)

               lastRow_Phieu_NL = lastRow_Phieu_NL + 1
2             Next k
        Next j

ws_Phieu_NL.Range("B" & PNL - 1 & ":E" & lastRow_Phieu_NL + 2).Sort Key1:=ws_Phieu_NL.Range("B" & PNL - 1 & ":B" & lastRow_Phieu_NL + 2), Order1:=xlAscending, Header:=xlYes


lastRow_KHXuatLK = Excel.WorksheetFunction.CountA(ws_KHXuatLK.Range("C:C")) + 1
startRow_KHXuatLK = Excel.WorksheetFunction.CountA(ws_KHXuatLK.Range("B:B"))
ws_Phieu_NL.Range("B" & PNL & ":C" & lastRow_Phieu_NL + 2).Copy
ws_KHXuatLK.Range("C" & lastRow_KHXuatLK + 1).PasteSpecial Paste:=xlPasteValues
        Application.CutCopyMode = False

ws_Phieu_NL.Range("E" & PNL & ":E" & lastRow_Phieu_NL + 2).Copy
ws_KHXuatLK.Range("E" & lastRow_KHXuatLK + 1).PasteSpecial Paste:=xlPasteValues
        Application.CutCopyMode = False

lastRow_KHXuatLK = Excel.WorksheetFunction.CountA(ws_KHXuatLK.Range("C:C")) + 1

ws_Phieu_NL.Range("B5").Copy
ws_KHXuatLK.Range("B" & startRow_KHXuatLK + 1 & ":B" & lastRow_KHXuatLK).PasteSpecial Paste:=xlPasteValues
        Application.CutCopyMode = False

ws_Phieu_NL.Range("D3").Copy
ws_KHXuatLK.Range("F" & startRow_KHXuatLK + 1 & ":F" & lastRow_KHXuatLK).PasteSpecial Paste:=xlPasteValues
        Application.CutCopyMode = False


End If
lastRow_KHXuatLK = Excel.WorksheetFunction.CountA(ws_KHXuatLK.Range("B:B"))

Next t

With ws_LKCoiSP
    If .FilterMode Then .AutoFilterMode = False
End With

ws_LKCoiSP.Rows("3:1048576").Delete

With ws_CumCoiSp
    If .FilterMode Then .AutoFilterMode = False
End With

ws_CumCoiSp.Rows("3:1048576").Delete

With ws_LichSX
    If .FilterMode Then .AutoFilterMode = False
End With
ws_LichSX.Rows("3:1048576").Delete
startRow_TonKho = 2
lastRow_TonKho = Excel.WorksheetFunction.CountA(ws_TonKho.Range("A:A")) + startRow_TonKho - 2
startRow_LichSX = 2
lastRow_LichSX = Excel.WorksheetFunction.CountA(ws_LichSX.Range("B:B")) + startRow_LichSX - 2

        For i = (startRow_TonKho + 1) To lastRow_TonKho
            If Excel.WorksheetFunction.CountIf(Sheets("BOM").Range("A:A"), ws_TonKho.Range("A" & i)) > 0 And ws_TonKho.Range("E" & i) > 0 Then
            ws_LichSX.Range("B" & (lastRow_LichSX + 1)) = Date
            ws_TonKho.Range("A" & i & ":B" & i).Copy
            ws_LichSX.Range("C" & (lastRow_LichSX + 1)).PasteSpecial Paste:=xlPasteValues, Operation:=xlNone, SkipBlanks _
                    :=False, Transpose:=False
            Application.CutCopyMode = False
            ws_TonKho.Range("E" & i).Copy
            ws_LichSX.Range("E" & (lastRow_LichSX + 1)).PasteSpecial Paste:=xlPasteValues, Operation:=xlNone, SkipBlanks _
                    :=False, Transpose:=False
             Application.CutCopyMode = False
            ws_LichSX.Range("F" & (lastRow_LichSX + 1)) = ws_LichSX.Range("F1")
            lastRow_LichSX = Excel.WorksheetFunction.CountA(ws_LichSX.Range("B:B")) + startRow_LichSX - 2
            End If
        Next i
lastRow_CumCoiSp = Excel.WorksheetFunction.CountA(ws_CumCoiSp.Range("B:B"))
If ws_LichSX.Range("B" & 3) <> "" Then
ws_LichSX.Range("B" & 3 & ":F" & lastRow_LichSX).Copy Destination:=ws_CumCoiSp.Range("B" & lastRow_CumCoiSp + 1)
End If



With Sheets("Phieu NL")
    If .FilterMode Then .AutoFilterMode = False
End With
ws_Phieu_NL.Rows("5:1048576").Delete

startRow_Phieu_NL = 4
lastRow_LichSX = Excel.WorksheetFunction.CountA(ws_LichSX.Range("B:B")) + startRow_LichSX - 2
lastRow_Phieu_NL = Excel.WorksheetFunction.CountA(ws_Phieu_NL.Range("B:B")) + startRow_Phieu_NL - 2

If lastRow_LichSX > startRow_LichSX + 1 Then
ws_LichSX.Range("B" & startRow_LichSX + 1 & ":E" & lastRow_LichSX).Copy
ws_Phieu_NL.Range("B" & lastRow_Phieu_NL).PasteSpecial xlPasteValues
Application.CutCopyMode = False
lastRow_Phieu_NL = Excel.WorksheetFunction.CountA(ws_Phieu_NL.Range("B:B")) + startRow_Phieu_NL - 2
ws_Phieu_NL.Range("B" & startRow_Phieu_NL + 1 & ":B" & lastRow_Phieu_NL - 1).NumberFormat = "[$-101042A]d mmmm yyyy;@"
ws_Phieu_NL.Range("B" & startRow_Phieu_NL & ":E" & lastRow_Phieu_NL - 1).Borders.LineStyle = xlContinuous


Sheets("TieuDe").Range("C6:F7").Copy Destination:=ws_Phieu_NL.Range("B" & lastRow_Phieu_NL + 1)


 PNL = lastRow_Phieu_NL + 3


For j = startRow_LichSX + 1 To lastRow_LichSX Step 1

   ws_LichSX.Range("C" & j).Copy
   ws_InBOM.Range("B4").PasteSpecial xlPasteValues
    Application.CutCopyMode = False

    Call XuatBOM
Application.ScreenUpdating = False
EventState = Application.EnableEvents
Application.EnableEvents = False
CalcState = Application.Calculation
Application.Calculation = xlCalculationAutomatic
PageBreakState = ActiveSheet.DisplayPageBreaks
ActiveSheet.DisplayPageBreaks = False


    lastRow_InBOM = Excel.WorksheetFunction.CountA(ws_InBOM.Range("A:A"))
    startRow_InBOM = 6
                For k = startRow_InBOM To lastRow_InBOM Step 1
                 For h = PNL To lastRow_Phieu_NL + 3 Step 1
                     If ws_InBOM.Range("A" & k).value = ws_Phieu_NL.Range("B" & h) Then
                       TamLuu = ws_Phieu_NL.Range("E" & h)
                        ws_Phieu_NL.Range("E" & h) = TamLuu + ws_InBOM.Range("D" & k) * ws_LichSX.Range("E" & j)
                        GoTo 10
                       End If
                       Next h


                        ws_InBOM.Range("A" & k & ":D" & k).Copy ws_Phieu_NL.Range("B" & lastRow_Phieu_NL + 3)


                        ws_Phieu_NL.Range("E" & lastRow_Phieu_NL + 3) = ws_InBOM.Range("D" & k) * ws_LichSX.Range("E" & j)

               lastRow_Phieu_NL = lastRow_Phieu_NL + 1
10                Next k
        Next j

ws_Phieu_NL.Range("B" & PNL - 1 & ":E" & lastRow_Phieu_NL + 2).Sort Key1:=ws_Phieu_NL.Range("B" & PNL - 1 & ":B" & lastRow_Phieu_NL + 2), Order1:=xlAscending, Header:=xlYes


lastRow_LKCoiSP = Excel.WorksheetFunction.CountA(ws_LKCoiSP.Range("C:C")) + 1
startRow_LKCoiSP = Excel.WorksheetFunction.CountA(ws_LKCoiSP.Range("B:B"))
ws_Phieu_NL.Range("B" & PNL & ":C" & lastRow_Phieu_NL + 2).Copy
ws_LKCoiSP.Range("C" & lastRow_LKCoiSP + 1).PasteSpecial Paste:=xlPasteValues
        Application.CutCopyMode = False

ws_Phieu_NL.Range("E" & PNL & ":E" & lastRow_Phieu_NL + 2).Copy
ws_LKCoiSP.Range("E" & lastRow_LKCoiSP + 1).PasteSpecial Paste:=xlPasteValues
        Application.CutCopyMode = False

lastRow_LKCoiSP = Excel.WorksheetFunction.CountA(ws_LKCoiSP.Range("C:C")) + 1

ws_Phieu_NL.Range("B5").Copy
ws_LKCoiSP.Range("B" & startRow_LKCoiSP + 1 & ":B" & lastRow_LKCoiSP).PasteSpecial Paste:=xlPasteValues
        Application.CutCopyMode = False

ws_Phieu_NL.Range("D3").Copy
ws_LKCoiSP.Range("F" & startRow_LKCoiSP + 1 & ":F" & lastRow_LKCoiSP).PasteSpecial Paste:=xlPasteValues
        Application.CutCopyMode = False
End If


Dim BANDAU As Integer
BANDAU = 3
Dim TK As Integer
For TK = 1 To 5
ws_LichSX.Rows("3:1048576").Delete
startRow_LKCoiSP = 2
lastRow_LKCoiSP = Excel.WorksheetFunction.CountA(ws_LKCoiSP.Range("B:B")) + startRow_LKCoiSP - 2
startRow_LichSX = 2
lastRow_LichSX = Excel.WorksheetFunction.CountA(ws_LichSX.Range("B:B")) + startRow_LichSX - 2

        For i = BANDAU To lastRow_LKCoiSP
            If Excel.WorksheetFunction.CountIf(Sheets("BOM").Range("A:A"), ws_LKCoiSP.Range("C" & i)) > 0 Then
            ws_LichSX.Range("B" & (lastRow_LichSX + 1)) = Date
            ws_LKCoiSP.Range("C" & i & ":D" & i).Copy
            ws_LichSX.Range("C" & (lastRow_LichSX + 1)).PasteSpecial Paste:=xlPasteValues, Operation:=xlNone, SkipBlanks _
                    :=False, Transpose:=False
            Application.CutCopyMode = False
            ws_LKCoiSP.Range("E" & i).Copy
            ws_LichSX.Range("E" & (lastRow_LichSX + 1)).PasteSpecial Paste:=xlPasteValues, Operation:=xlNone, SkipBlanks _
                    :=False, Transpose:=False
             Application.CutCopyMode = False
            ws_LichSX.Range("F" & (lastRow_LichSX + 1)) = ws_LichSX.Range("F1")
            lastRow_LichSX = Excel.WorksheetFunction.CountA(ws_LichSX.Range("B:B")) + startRow_LichSX - 2
            End If
        Next i
     BANDAU = lastRow_LKCoiSP + 1
lastRow_CumCoiSp = Excel.WorksheetFunction.CountA(ws_CumCoiSp.Range("B:B"))
If ws_LichSX.Range("B" & 3) <> "" Then
ws_LichSX.Range("B" & 3 & ":F" & lastRow_LichSX).Copy Destination:=ws_CumCoiSp.Range("B" & lastRow_CumCoiSp + 1)
End If



With Sheets("Phieu NL")
    If .FilterMode Then .AutoFilterMode = False
End With
ws_Phieu_NL.Rows("5:1048576").Delete

startRow_Phieu_NL = 4
lastRow_LichSX = Excel.WorksheetFunction.CountA(ws_LichSX.Range("B:B")) + startRow_LichSX - 2
lastRow_Phieu_NL = Excel.WorksheetFunction.CountA(ws_Phieu_NL.Range("B:B")) + startRow_Phieu_NL - 2

If lastRow_LichSX > startRow_LichSX + 1 Then
ws_LichSX.Range("B" & startRow_LichSX + 1 & ":E" & lastRow_LichSX).Copy
ws_Phieu_NL.Range("B" & lastRow_Phieu_NL).PasteSpecial xlPasteValues
Application.CutCopyMode = False
lastRow_Phieu_NL = Excel.WorksheetFunction.CountA(ws_Phieu_NL.Range("B:B")) + startRow_Phieu_NL - 2
ws_Phieu_NL.Range("B" & startRow_Phieu_NL + 1 & ":B" & lastRow_Phieu_NL - 1).NumberFormat = "[$-101042A]d mmmm yyyy;@"
ws_Phieu_NL.Range("B" & startRow_Phieu_NL & ":E" & lastRow_Phieu_NL - 1).Borders.LineStyle = xlContinuous



Sheets("TieuDe").Range("C6:F7").Copy Destination:=ws_Phieu_NL.Range("B" & lastRow_Phieu_NL + 1)


 PNL = lastRow_Phieu_NL + 3


For j = startRow_LichSX + 1 To lastRow_LichSX Step 1

   ws_LichSX.Range("C" & j).Copy
   ws_InBOM.Range("B4").PasteSpecial xlPasteValues
    Application.CutCopyMode = False

    Call XuatBOM
Application.ScreenUpdating = False
EventState = Application.EnableEvents
Application.EnableEvents = False
CalcState = Application.Calculation
Application.Calculation = xlCalculationAutomatic
PageBreakState = ActiveSheet.DisplayPageBreaks
ActiveSheet.DisplayPageBreaks = False


    lastRow_InBOM = Excel.WorksheetFunction.CountA(ws_InBOM.Range("A:A"))
    startRow_InBOM = 6
                For k = startRow_InBOM To lastRow_InBOM Step 1
                 For h = PNL To lastRow_Phieu_NL + 3 Step 1
                     If ws_InBOM.Range("A" & k).value = ws_Phieu_NL.Range("B" & h) Then
                       TamLuu = ws_Phieu_NL.Range("E" & h)
                        ws_Phieu_NL.Range("E" & h) = TamLuu + ws_InBOM.Range("D" & k) * ws_LichSX.Range("E" & j)
                        GoTo 11
                       End If
                       Next h


                        ws_InBOM.Range("A" & k & ":D" & k).Copy ws_Phieu_NL.Range("B" & lastRow_Phieu_NL + 3)


                        ws_Phieu_NL.Range("E" & lastRow_Phieu_NL + 3) = ws_InBOM.Range("D" & k) * ws_LichSX.Range("E" & j)

               lastRow_Phieu_NL = lastRow_Phieu_NL + 1
11                Next k
        Next j

ws_Phieu_NL.Range("B" & PNL - 1 & ":E" & lastRow_Phieu_NL + 2).Sort Key1:=ws_Phieu_NL.Range("B" & PNL - 1 & ":B" & lastRow_Phieu_NL + 2), Order1:=xlAscending, Header:=xlYes


lastRow_LKCoiSP = Excel.WorksheetFunction.CountA(ws_LKCoiSP.Range("C:C")) + 1
startRow_LKCoiSP = Excel.WorksheetFunction.CountA(ws_LKCoiSP.Range("B:B"))
ws_Phieu_NL.Range("B" & PNL & ":C" & lastRow_Phieu_NL + 2).Copy
ws_LKCoiSP.Range("C" & lastRow_LKCoiSP + 1).PasteSpecial Paste:=xlPasteValues
        Application.CutCopyMode = False

ws_Phieu_NL.Range("E" & PNL & ":E" & lastRow_Phieu_NL + 2).Copy
ws_LKCoiSP.Range("E" & lastRow_LKCoiSP + 1).PasteSpecial Paste:=xlPasteValues
        Application.CutCopyMode = False

lastRow_LKCoiSP = Excel.WorksheetFunction.CountA(ws_LKCoiSP.Range("C:C")) + 1

ws_Phieu_NL.Range("B5").Copy
ws_LKCoiSP.Range("B" & startRow_LKCoiSP + 1 & ":B" & lastRow_LKCoiSP).PasteSpecial Paste:=xlPasteValues
        Application.CutCopyMode = False

ws_Phieu_NL.Range("D3").Copy
ws_LKCoiSP.Range("F" & startRow_LKCoiSP + 1 & ":F" & lastRow_LKCoiSP).PasteSpecial Paste:=xlPasteValues
        Application.CutCopyMode = False
End If


Next TK




With ws_DatLKTheoBanHang
    If .FilterMode Then .AutoFilterMode = False
End With
ws_DatLKTheoBanHang.Rows("3:1048576").Delete
SoNgayKeHoachBan = ws_KHbanSale.Range("F1")
kho = ws_LyDoXN.Range("F3").value
startRow_DanhMucHH = 2
startRow_DatLKTheoBanHang = 2

lastRow_DanhMucHH = Excel.WorksheetFunction.CountA(ws_DanhMucHH.Range("B:B")) + startRow_DanhMucHH - 1
lastRow_DatLKTheoBanHang = Excel.WorksheetFunction.CountA(ws_DatLKTheoBanHang.Range("B:B")) + startRow_DatLKTheoBanHang - 1

For m = startRow_DanhMucHH + 1 To lastRow_DanhMucHH Step 1
    lastRow_DuBaoSX = Excel.WorksheetFunction.CountA(ws_DuBaoSX.Range("B:B")) + startRow_DuBaoSX - 2
   
            SLDaNhap = Excel.WorksheetFunction.SumIfs(ws_LuuNhap.Range("E:E"), ws_LuuNhap.Range("C:C"), ws_DanhMucHH.Range("B" & m), ws_LuuNhap.Range("G:G"), kho, ws_LuuNhap.Range("B:B"), "<" & CLng(a))
            SLDaNhapCK = Excel.WorksheetFunction.SumIfs(ws_LuuChuyenKho.Range("E:E"), ws_LuuChuyenKho.Range("C:C"), ws_DanhMucHH.Range("B" & m), ws_LuuChuyenKho.Range("G:G"), kho, ws_LuuChuyenKho.Range("B:B"), "<" & CLng(a))
            SLDaNhapSXTP = Excel.WorksheetFunction.SumIfs(ws_LuuNhapSXTP.Range("E:E"), ws_LuuNhapSXTP.Range("C:C"), ws_DanhMucHH.Range("B" & m), ws_LuuNhapSXTP.Range("F:F"), kho, ws_LuuNhapSXTP.Range("B:B"), "<" & CLng(a))
            TongSLDaNhap = SLDaNhap + SLDaNhapCK + SLDaNhapSXTP

            SLDaXuat = Excel.WorksheetFunction.SumIfs(ws_LuuXuat.Range("E:E"), ws_LuuXuat.Range("C:C"), ws_DanhMucHH.Range("B" & m), ws_LuuXuat.Range("G:G"), kho, ws_LuuXuat.Range("B:B"), "<" & CLng(a))
            SLDaXuatCK = Excel.WorksheetFunction.SumIfs(ws_LuuChuyenKho.Range("E:E"), ws_LuuChuyenKho.Range("C:C"), ws_DanhMucHH.Range("B" & m), ws_LuuChuyenKho.Range("F:F"), kho, ws_LuuChuyenKho.Range("B:B"), "<" & CLng(a))
            SLDaXuatSXLK = Excel.WorksheetFunction.SumIfs(ws_LuuXuatSXLK.Range("E:E"), ws_LuuXuatSXLK.Range("C:C"), ws_DanhMucHH.Range("B" & m), ws_LuuXuatSXLK.Range("F:F"), kho, ws_LuuXuatSXLK.Range("B:B"), "<" & CLng(a))
            TongSLDaXuat = SLDaXuat + SLDaXuatCK + SLDaXuatSXLK

            SLDieuChinh = Excel.WorksheetFunction.SumIfs(ws_DieuChinhKho.Range("E:E"), ws_DieuChinhKho.Range("C:C"), ws_DanhMucHH.Range("B" & m), ws_DieuChinhKho.Range("G:G"), kho)

            SLDauKy = TongSLDaNhap - TongSLDaXuat + SLDieuChinh

            SLNhap_TK = Excel.WorksheetFunction.SumIfs(ws_LuuNhap.Range("E:E"), ws_LuuNhap.Range("C:C"), ws_DanhMucHH.Range("B" & m), ws_LuuNhap.Range("G:G"), kho, ws_LuuNhap.Range("B:B"), ">=" & CLng(a), ws_LuuNhap.Range("B:B"), "<=" & CLng(b))
            SLNhapCK_TK = Excel.WorksheetFunction.SumIfs(ws_LuuChuyenKho.Range("E:E"), ws_LuuChuyenKho.Range("C:C"), ws_DanhMucHH.Range("B" & m), ws_LuuChuyenKho.Range("G:G"), kho, ws_LuuChuyenKho.Range("B:B"), ">=" & CLng(a), ws_LuuChuyenKho.Range("B:B"), "<=" & CLng(b))
            SLNhapSXTP_TK = Excel.WorksheetFunction.SumIfs(ws_LuuNhapSXTP.Range("E:E"), ws_LuuNhapSXTP.Range("C:C"), ws_DanhMucHH.Range("B" & m), ws_LuuNhapSXTP.Range("F:F"), kho, ws_LuuNhapSXTP.Range("B:B"), ">=" & CLng(a), ws_LuuNhapSXTP.Range("B:B"), "<=" & CLng(b))
            TongSLNhap_TK = SLNhap_TK + SLNhapCK_TK + SLNhapSXTP_TK

            SLXuat_TK = Excel.WorksheetFunction.SumIfs(ws_LuuXuat.Range("E:E"), ws_LuuXuat.Range("C:C"), ws_DanhMucHH.Range("B" & m), ws_LuuXuat.Range("G:G"), kho, ws_LuuXuat.Range("B:B"), ">=" & CLng(a), ws_LuuXuat.Range("B:B"), "<=" & CLng(b))
            SLXuatCK_TK = Excel.WorksheetFunction.SumIfs(ws_LuuChuyenKho.Range("E:E"), ws_LuuChuyenKho.Range("C:C"), ws_DanhMucHH.Range("B" & m), ws_LuuChuyenKho.Range("F:F"), kho, ws_LuuChuyenKho.Range("B:B"), ">=" & CLng(a), ws_LuuChuyenKho.Range("B:B"), "<=" & CLng(b))
            SLXuatSXLK_TK = Excel.WorksheetFunction.SumIfs(ws_LuuXuatSXLK.Range("E:E"), ws_LuuXuatSXLK.Range("C:C"), ws_DanhMucHH.Range("B" & m), ws_LuuXuatSXLK.Range("F:F"), kho, ws_LuuXuatSXLK.Range("B:B"), ">=" & CLng(a), ws_LuuXuatSXLK.Range("B:B"), "<=" & CLng(b))
            TongSLXuat_TK = SLXuat_TK + SLXuatCK_TK + SLXuatSXLK_TK

            SLKhoCon = SLDauKy + TongSLNhap_TK - TongSLXuat_TK

            lastRow_DatLKTheoBanHang = Excel.WorksheetFunction.CountA(ws_DatLKTheoBanHang.Range("B:B")) + startRow_DatLKTheoBanHang - 1
            NSX = Excel.WorksheetFunction.SumIfs(ws_KHSPNhan.Range("E:E"), ws_KHSPNhan.Range("C:C"), ws_DanhMucHH.Range("B" & m))
            XLK = Excel.WorksheetFunction.SumIfs(ws_KHXuatLK.Range("E:E"), ws_KHXuatLK.Range("C:C"), ws_DanhMucHH.Range("B" & m))
            
           Dim z As Variant
            z = Application.VLookup(ws_DanhMucHH.Range("B" & m), ws_BOM.Range("A:A"), 1, 0)
            If IsError(z) = True Then
            KHB = Excel.WorksheetFunction.SumIfs(ws_DuBaoSX.Range("H:H"), ws_DuBaoSX.Range("B:B"), ws_DanhMucHH.Range("B" & m))
            Else
            KHB = 0
            End If
            DKX = XLK + KHB
           



      LKtrongSP = Excel.WorksheetFunction.SumIfs(ws_LKCoiSP.Range("E:E"), ws_LKCoiSP.Range("C:C"), ws_DanhMucHH.Range("B" & m))

            If DKX > 0 Then
             If Excel.WorksheetFunction.CountIf(Sheets("BOM").Range("A:A"), ws_DanhMucHH.Range("B" & m)) = 0 Then
                          
             If (DKX * (ws_DanhMucHH.Range("F" & m) + ws_DanhMucHH.Range("H" & m) * 2) / SoNgayKeHoachBan - SLKhoCon - LKtrongSP) > 0 Then

                        NgayTon = (SLKhoCon + LKtrongSP) * SoNgayKeHoachBan / DKX
                        

                        ws_DatLKTheoBanHang.Range("B" & lastRow_DatLKTheoBanHang) = ws_DanhMucHH.Range("B" & m)
                        ws_DatLKTheoBanHang.Range("C" & lastRow_DatLKTheoBanHang) = ws_DanhMucHH.Range("C" & m)
                        ws_DatLKTheoBanHang.Range("D" & lastRow_DatLKTheoBanHang) = SLKhoCon
                        If NgayTon <= ws_DanhMucHH.Range("E" & m) Then

                                       With ws_DatLKTheoBanHang.Range("B" & lastRow_DatLKTheoBanHang & ":H" & lastRow_DatLKTheoBanHang).Font
                                       .Color = 255
                                       End With
                                       With ws_DatLKTheoBanHang.Range("B" & lastRow_DatLKTheoBanHang & ":H" & lastRow_DatLKTheoBanHang).Interior
                                       .Pattern = xlGray8
                                       .PatternColorIndex = xlAutomatic
                                       .Color = 65535
                                       .TintAndShade = 0
                                       .PatternTintAndShade = 0
                                       End With

                                        With ws_DatLKTheoBanHang.Range("J" & lastRow_DatLKTheoBanHang & ":J" & lastRow_DatLKTheoBanHang).Font
                                       .Color = 255
                                       End With
                                       With ws_DatLKTheoBanHang.Range("J" & lastRow_DatLKTheoBanHang & ":J" & lastRow_DatLKTheoBanHang).Interior
                                       .Pattern = xlGray8
                                       .PatternColorIndex = xlAutomatic
                                       .Color = 65535
                                       .TintAndShade = 0
                                       .PatternTintAndShade = 0
                                       End With


                            End If
                        ws_DatLKTheoBanHang.Range("E" & lastRow_DatLKTheoBanHang) = LKtrongSP
                        ws_DatLKTheoBanHang.Range("F" & lastRow_DatLKTheoBanHang) = DKX
                        ws_DatLKTheoBanHang.Range("G" & lastRow_DatLKTheoBanHang) = NgayTon
                        ' Khai báo bi?n t?m d? d?m b?o ki?u d? li?u là s?
Dim hsF As Double, hsH As Double

' Gán giá tr? m?c d?nh = 0 n?u không ph?i s?
If IsNumeric(ws_DanhMucHH.Range("F" & m).value) Then
    hsF = ws_DanhMucHH.Range("F" & m).value
Else
    hsF = 0
End If

If IsNumeric(ws_DanhMucHH.Range("H" & m).value) Then
    hsH = ws_DanhMucHH.Range("H" & m).value
Else
    hsH = 0
End If

' Ki?m tra tránh chia cho 0
If SoNgayKeHoachBan > 0 Then
    ws_DatLKTheoBanHang.Range("H" & lastRow_DatLKTheoBanHang).value = DKX * (hsF + hsH * 2) / SoNgayKeHoachBan - SLKhoCon - LKtrongSP
Else
    ws_DatLKTheoBanHang.Range("H" & lastRow_DatLKTheoBanHang).value = "L?i: SoNgayKeHoachBan = 0"
End If

                        ws_DatLKTheoBanHang.Range("J" & lastRow_DatLKTheoBanHang).value = Date + Round(NgayTon, 0)
                        ws_DatLKTheoBanHang.Range("K" & lastRow_DatLKTheoBanHang) = ws_DanhMucHH.Range("F" & m)
                        ws_DatLKTheoBanHang.Range("L" & lastRow_DatLKTheoBanHang) = ws_DanhMucHH.Range("H" & m)
                        
                         If IsNumeric(ws_DatLKTheoBanHang.Range("L" & lastRow_DatLKTheoBanHang)) Then
                                    If NgayTon <= ws_DatLKTheoBanHang.Range("L" & lastRow_DatLKTheoBanHang) Then
                                        ws_DatLKTheoBanHang.Range("M" & lastRow_DatLKTheoBanHang) = "Can Dat Hang Gap"
                                            With ws_DatLKTheoBanHang.Range("M" & lastRow_DatLKTheoBanHang).Font
                                                 .Color = 255
                                            End With
                                    End If
                       
                         End If
                        
                        
                        
              End If
           End If

        End If



Next m

lastRow_DatLKTheoBanHang = Excel.WorksheetFunction.CountA(ws_DatLKTheoBanHang.Range("B:B")) + startRow_DatLKTheoBanHang - 1
ws_DatLKTheoBanHang.Range("B" & startRow_DatLKTheoBanHang & ":J" & lastRow_DatLKTheoBanHang - 1).Borders.LineStyle = xlContinuous
ws_DatLKTheoBanHang.Range("B" & startRow_DatLKTheoBanHang & ":I" & lastRow_DatLKTheoBanHang - 1).NumberFormat = "_-* #,##0_-;-* #,##0_-;_-* ""-""??_-;_-@_-"
Range("J" & startRow_DatLKTheoBanHang & ":J" & lastRow_DatLKTheoBanHang - 1).NumberFormat = "[$-,101]d/m/yy;@"
ws_DatLKTheoBanHang.Range("B" & startRow_DatLKTheoBanHang & ":M" & lastRow_DatLKTheoBanHang - 1).Columns.AutoFit
With Worksheets("DatLKTheoBanHang")
         .Visible = xlSheetVisible
         .Activate
     End With

    ws_DatLKTheoBanHang.Sort.SortFields.Clear
    With ws_DatLKTheoBanHang.Sort.SortFields.Add(Range("B3"), xlSortOnCellColor, xlAscending, , xlSortNormal)
        .SortOnValue.Color = RGB(255, 255, 0)
        .SortOnValue.PatternColor = RGB(0, 0, 0)
        .SortOnValue.Pattern = 18
    End With
    With ws_DatLKTheoBanHang.Sort
        .SetRange ws_DatLKTheoBanHang.Range("B2" & ":M" & lastRow_DatLKTheoBanHang - 1)
        .Header = xlYes
        .MatchCase = False
        .Orientation = xlTopToBottom
        .SortMethod = xlPinYin
        .Apply
    End With


ws_LichSX.Rows(startRow_LichSX + 1 & ":" & lastRow_LichSX + 2).EntireRow.Delete
ws_Phieu_NL.Rows("5:1048576").Delete


Application.DisplayAlerts = False
Sheets("DatLKTheoBanHang").Range("F1") = "DatLKTheoBanHang"

Call CopySheetTo
Application.ScreenUpdating = False
EventState = Application.EnableEvents
Application.EnableEvents = False
CalcState = Application.Calculation
Application.Calculation = xlCalculationAutomatic
PageBreakState = ActiveSheet.DisplayPageBreaks
ActiveSheet.DisplayPageBreaks = False
Application.DisplayAlerts = True

ThisWorkbook.Activate
3
ActiveSheet.DisplayPageBreaks = PageBreakState
Application.Calculation = CalcState
Application.EnableEvents = EventState
Application.ScreenUpdating = True

End Sub









