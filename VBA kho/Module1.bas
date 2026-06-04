Attribute VB_Name = "Module1"
'Option Private Module

Sub CapNhatBom()
If Date > 46421 Then
Exit Sub
End If
Dim h, c As Integer
h = Sheet20.Range("C3")
c = 37
If Sheet20.Cells(h, c) = "Y" Then
UserForm_CapNhat_BOM.Show
Else
MsgBox ("Ban khong duoc quyen chay nut nay")
End If
End Sub
Sub ChangePassWord()
Dim h, c As Integer
h = Sheet20.Range("C3")
c = 40
If Sheet20.Cells(h, c) = "Y" Then
Form_DoiPassWord.Show
Else
MsgBox ("Ban khong duoc quyen chay nut nay")
End If
End Sub
Sub XemBom()
Dim h, c As Integer
h = Sheet20.Range("C3")
c = 38
If Sheet20.Cells(h, c) = "Y" Then
UserForm_XemBOM.Show
Else
MsgBox ("Ban khong duoc quyen chay nut nay")
End If
End Sub
Sub XuatBomChiTiet()
Dim lr As Long
   lr = 1
  For Each ws In ThisWorkbook.Worksheets
  If ws.Name <> "GiaoDien" Then
  With Sheets(ws.Name)
                                    If .FilterMode Then .AutoFilterMode = False
                                  End With
  

                If Sheets(ws.Name).Visible = xlSheetHidden Then
                                  Sheets(ws.Name).Visible = xlSheetVisible
                                  

                              
                End If
                    lr = lr + 1
            End If
  Next ws
UserForm_XuatBomChiTiet.Show
End Sub

Sub FormNCC()
Dim h, c As Integer
h = Sheet20.Range("C3")
c = 36
If Sheet20.Cells(h, c) = "Y" Then
UserForm_NhaCungCap.Show
Else
MsgBox ("Ban khong duoc quyen chay nut nay")
End If
End Sub

Sub FORM_DMHH()
If Date > 46421 Then
Exit Sub
End If
Dim h, c As Integer
h = Sheet20.Range("C3")
c = 35
If Sheet20.Cells(h, c) = "Y" Then
Form_Danh_Muc_Hang_Hoa.Show
Else
MsgBox ("Ban khong duoc quyen chay nut nay")
End If
End Sub
Sub FormChuyenKho()
If Date > 46421 Then
Exit Sub
End If
Dim h, c As Integer
h = Sheet20.Range("C3")
c = 44
If Sheet20.Cells(h, c) = "Y" Then
UserFormChuyenKho.Show
Else
MsgBox ("Ban khong duoc quyen chay nut nay")
End If
End Sub
Sub FormChinhTonKho()
If Date > 46421 Then
Exit Sub
End If
Dim h, c As Integer
h = Sheet20.Range("C3")
c = 45
If Sheet20.Cells(h, c) = "Y" Then
UserForm_DieuChinhKho.Show
Else
MsgBox ("Ban khong duoc quyen chay nut nay")
End If
End Sub
Sub Form_XuatHang()
If Date > 46421 Then
Exit Sub
End If
Dim h, c As Integer
h = Sheet20.Range("C3")
c = 42
If Sheet20.Cells(h, c) = "Y" Then
UserForm_XuatHang.Show
Else
MsgBox ("Ban khong duoc quyen chay nut nay")
End If
End Sub
Sub Form_NhapHang()
If Date > 46421 Then
Exit Sub
End If
Dim h, c As Integer
h = Sheet20.Range("C3")
c = 41
If Sheet20.Cells(h, c) = "Y" Then
UserForm_nhaphang.Show
Else
MsgBox ("Ban khong duoc quyen chay nut nay")
End If
End Sub
Sub Form_NhapLichSX()
If Date > 46421 Then
Exit Sub
End If
Dim h, c As Integer
h = Sheet20.Range("C3")
c = 43
If Sheet20.Cells(h, c) = "Y" Then
UserForm_NhapLichSX.Show
Else
MsgBox ("Ban khong duoc quyen chay nut nay")
End If
End Sub
Sub Form_BaoCaoKho()
If Date > 46421 Then
Exit Sub
End If
Dim h, c As Integer
h = Sheet20.Range("C3")
c = 46
If Sheet20.Cells(h, c) = "Y" Then
UserFormBaoCaoKho.Show
Else
MsgBox ("Ban khong duoc quyen chay nut nay")
End If
End Sub
Sub FORM_KeHoachChuanBiHang()
If Date > 46421 Then
Exit Sub
End If
Dim h, c As Integer
h = Sheet20.Range("C3")
c = 47
If Sheet20.Cells(h, c) = "Y" Then
UserFormKeHoachHang.Show
Else
MsgBox ("Ban khong duoc quyen chay nut nay")
End If
End Sub
Sub FORM_BaoCaoChuyenKho()
If Date > 46421 Then
Exit Sub
End If
Dim h, c As Integer
h = Sheet20.Range("C3")
c = 50
If Sheet20.Cells(h, c) = "Y" Then
UserForm_BaoCaoChuyenKho.Show
Else
MsgBox ("Ban khong duoc quyen chay nut nay")
End If
End Sub
Sub FORM_BaoCaoChinhTonKho()
If Date > 46421 Then
Exit Sub
End If
Dim h, c As Integer
h = Sheet20.Range("C3")
c = 51
If Sheet20.Cells(h, c) = "Y" Then
UserFormBaoCaoChinhKho.Show
Else
MsgBox ("Ban khong duoc quyen chay nut nay")
End If
End Sub
Sub FORM_BaoCaoNhapHang()
If Date > 46421 Then
Exit Sub
End If
Dim h, c As Integer
h = Sheet20.Range("C3")
c = 48
If Sheet20.Cells(h, c) = "Y" Then
UserForm_BaoCaoNhapHang.Show
Else
MsgBox ("Ban khong duoc quyen chay nut nay")
End If
End Sub
Sub FORM_BaoCaoXuatHang()
If Date > 46421 Then
Exit Sub
End If
Dim h, c As Integer
h = Sheet20.Range("C3")
c = 49
If Sheet20.Cells(h, c) = "Y" Then
UserForm_BaoCaoXuatHang.Show
Else
MsgBox ("Ban khong duoc quyen chay nut nay")
End If
End Sub

Sub Form_An_Hien_Sheet()
Form_AnHienTrangTinh.Show
End Sub
Sub Luu_Nhap()
If Date > 46421 Then
Exit Sub
End If
Application.ScreenUpdating = False
EventState = Application.EnableEvents
Application.EnableEvents = False
CalcState = Application.Calculation
Application.Calculation = xlCalculationAutomatic
PageBreakState = ActiveSheet.DisplayPageBreaks
ActiveSheet.DisplayPageBreaks = False


Dim ws_Nhap, ws_LuuNhap, ws_DemKho As Worksheet
Dim i, startRow_Nhap, startRow_LuuNhap, lastRow_Nhap, lastRow_LuuNhap, lastRow_DemKho As Double
Dim ws_DanhMucHH As Worksheet
Set ws_DanhMucHH = ThisWorkbook.Sheets("Danh Muc HH")
Set ws_DemKho = ThisWorkbook.Sheets("DemKho")
Set ws_Nhap = ThisWorkbook.Sheets("Nhap")
Set ws_LuuNhap = ThisWorkbook.Sheets("LuuNhap")
startRow_Nhap = 2
startRow_LuuNhap = 2
lastRow_Nhap = Excel.WorksheetFunction.CountA(ws_Nhap.Range("C:C")) + startRow_Nhap - 1
lastRow_LuuNhap = Excel.WorksheetFunction.CountA(ws_LuuNhap.Range("C:C")) + startRow_LuuNhap - 1
ws_Nhap.Rows(lastRow_Nhap + 1 & ":" & lastRow_Nhap + 3000).EntireRow.Delete
lastRow_Nhap = Excel.WorksheetFunction.CountA(ws_Nhap.Range("C:C")) + startRow_Nhap - 1
lastRow_DemKho = Excel.WorksheetFunction.CountA(ws_DemKho.Range("B:B"))
For i = 3 To lastRow_Nhap
If Excel.WorksheetFunction.CountIfs(ws_DanhMucHH.Range("B:B"), ws_Nhap.Range("C" & i)) = 0 Then
       MsgBox "Ma so nay chua ton tai trong Danh muc Hang hoa"
    GoTo 2
End If
Next i
Dim ws_ws_DMNCC As Worksheet
Set ws_DMNCC = ThisWorkbook.Sheets("DM NCC")
Dim j As Integer
For j = 3 To lastRow_Nhap
If Excel.WorksheetFunction.CountIfs(ws_DMNCC.Range("B:B"), ws_Nhap.Range("F" & j)) = 0 Then
MsgBox "Ma NCC chua ton tai trong Danh muc NCC"
GoTo 2
End If
Next j
If lastRow_Nhap > startRow_Nhap Then
ws_DemKho.Range("SoDoKho[#All]").AutoFilter
ws_Nhap.Range("C" & startRow_Nhap + 1 & ":D" & lastRow_Nhap).Copy
lastRow_DemKho = Excel.WorksheetFunction.CountA(ws_DemKho.Range("B:B"))
ws_DemKho.Range("B" & lastRow_DemKho + 1).PasteSpecial xlPasteValues
Dim last As Integer
last = Excel.WorksheetFunction.CountA(ws_DemKho.Range("B:B"))
For v = lastRow_DemKho + 1 To last
ws_DemKho.Range("D" & v) = Excel.WorksheetFunction.VLookup(ws_DemKho.Range("B" & v), ws_DanhMucHH.Range("B:F"), 3, 0)
Next v
ws_Nhap.Range("J" & startRow_Nhap + 1 & ":J" & lastRow_Nhap).Copy
ws_DemKho.Range("E" & lastRow_DemKho + 1).PasteSpecial xlPasteValues
ws_Nhap.Range("B" & startRow_Nhap + 1 & ":B" & lastRow_Nhap).Copy
ws_DemKho.Range("F" & lastRow_DemKho + 1).PasteSpecial xlPasteValues
ws_Nhap.Range("E" & startRow_Nhap + 1 & ":E" & lastRow_Nhap).Copy
ws_DemKho.Range("G" & lastRow_DemKho + 1).PasteSpecial xlPasteValues

ws_Nhap.Range("B" & startRow_Nhap + 1 & ":J" & lastRow_Nhap).Copy
ws_LuuNhap.Range("B" & lastRow_LuuNhap + 1).PasteSpecial xlPasteValues
ws_Nhap.Rows(startRow_Nhap + 2 & ":" & lastRow_Nhap + 2).EntireRow.Delete
ws_Nhap.Range("B3") = ""
ws_Nhap.Range("C3") = ""
ws_Nhap.Range("E3:J3") = ""
ws_Nhap.Range("D3").FormulaR1C1 = "=IFERROR(VLOOKUP([Mã hàng],DMHH,2,0),"""")"
End If
lastRow_LuuNhap = Excel.WorksheetFunction.CountA(ws_LuuNhap.Range("C:C")) + startRow_LuuNhap - 1
ws_LuuNhap.Range("B3:J3").Copy
ws_LuuNhap.Range("B3:J" & lastRow_LuuNhap).PasteSpecial Paste:=xlPasteFormats, Operation:=xlNone, SkipBlanks:=False, Transpose:=False
Application.CutCopyMode = False
Call TonKho
2   ActiveSheet.DisplayPageBreaks = PageBreakState
Application.Calculation = CalcState
Application.EnableEvents = EventState
Application.ScreenUpdating = True
End Sub
Sub Luu_ChuyenKho()
If Date > 46421 Then
Exit Sub
End If
Application.ScreenUpdating = False
EventState = Application.EnableEvents
Application.EnableEvents = False
CalcState = Application.Calculation
Application.Calculation = xlCalculationAutomatic
PageBreakState = ActiveSheet.DisplayPageBreaks
ActiveSheet.DisplayPageBreaks = False

Dim ws_LuuChuyenKho, ws_ChuyenKho As Worksheet
Dim i, startRow_ChuyenKho, startRow_LuuChuyenKho, lastRow_ChuyenKho, lastRow_LuuChuyenKho As Double
Set ws_ChuyenKho = ThisWorkbook.Sheets("ChuyenKho")
Set ws_LuuChuyenKho = ThisWorkbook.Sheets("LuuChuyenKho")
Dim ws_DanhMucHH As Worksheet
Set ws_DanhMucHH = ThisWorkbook.Sheets("Danh Muc HH")

startRow_ChuyenKho = 2
startRow_LuuChuyenKho = 2
lastRow_ChuyenKho = Excel.WorksheetFunction.CountA(ws_ChuyenKho.Range("C:C")) + startRow_ChuyenKho - 1
lastRow_LuuChuyenKho = Excel.WorksheetFunction.CountA(ws_LuuChuyenKho.Range("C:C")) + startRow_LuuChuyenKho - 1

            For i = 3 To lastRow_ChuyenKho
            If Excel.WorksheetFunction.CountIfs(ws_DanhMucHH.Range("B:B"), ws_ChuyenKho.Range("C" & i)) = 0 Then
            MsgBox "Ma so nay chua ton tai trong Danh muc Hang hoa"
            GoTo 2
            End If
            Next i

If lastRow_ChuyenKho > startRow_ChuyenKho Then
ws_ChuyenKho.Range("B" & startRow_ChuyenKho + 1 & ":H" & lastRow_ChuyenKho).Copy
ws_LuuChuyenKho.Range("B" & lastRow_LuuChuyenKho + 1).PasteSpecial xlPasteValues
ws_ChuyenKho.Rows(startRow_ChuyenKho + 2 & ":" & lastRow_ChuyenKho + 2).EntireRow.Delete
ws_ChuyenKho.Range("B3") = ""
ws_ChuyenKho.Range("C3") = ""
ws_ChuyenKho.Range("E3:I3") = ""
ws_ChuyenKho.Range("D3").FormulaR1C1 = "=IFERROR(VLOOKUP([Mã hàng],DMHH,2,0),"""")"
End If
lastRow_LuuChuyenKho = Excel.WorksheetFunction.CountA(ws_LuuChuyenKho.Range("C:C")) + startRow_LuuChuyenKho - 1
ws_LuuChuyenKho.Range("B3:H3").Copy
ws_LuuChuyenKho.Range("B3:H" & lastRow_LuuChuyenKho).PasteSpecial Paste:=xlPasteFormats, Operation:=xlNone, SkipBlanks:=False, Transpose:=False
Application.CutCopyMode = False

2       ActiveSheet.DisplayPageBreaks = PageBreakState
Application.Calculation = CalcState
Application.EnableEvents = EventState
Application.ScreenUpdating = True
End Sub

Sub Luu_Xuat()
If Date > 46421 Then
Exit Sub
End If
Application.ScreenUpdating = False
EventState = Application.EnableEvents
Application.EnableEvents = False
CalcState = Application.Calculation
Application.Calculation = xlCalculationAutomatic
PageBreakState = ActiveSheet.DisplayPageBreaks
ActiveSheet.DisplayPageBreaks = False

Dim ws_Xuat, ws_LuuXuat, ws_LuuNhap As Worksheet
Dim i, startRow_Xuat, startRow_LuuXuat, lastRow_Xuat, lastRow_LuuXuat As Double
Set ws_Xuat = ThisWorkbook.Sheets("Xuat")
Set ws_LuuXuat = ThisWorkbook.Sheets("LuuXuat")
Dim ws_DanhMucHH As Worksheet
Set ws_DanhMucHH = ThisWorkbook.Sheets("Danh Muc HH")


startRow_Xuat = 2
startRow_LuuXuat = 2
lastRow_Xuat = Excel.WorksheetFunction.CountA(ws_Xuat.Range("C:C")) + 1
lastRow_LuuXuat = Excel.WorksheetFunction.CountA(ws_LuuXuat.Range("C:C")) + startRow_LuuXuat - 1
ws_Xuat.Rows(lastRow_Xuat + 2 & ":" & lastRow_Xuat + 3000).EntireRow.Delete
lastRow_Xuat = Excel.WorksheetFunction.CountA(ws_Xuat.Range("C:C")) + 1


For i = 3 To lastRow_Xuat
        If Excel.WorksheetFunction.CountIfs(ws_DanhMucHH.Range("B:B"), ws_Xuat.Range("C" & i)) = 0 Then
               MsgBox "Ma so nay chua ton tai trong Danh muc Hang hoa"
              
        GoTo 2
        End If
Next i
If lastRow_Xuat > startRow_Xuat Then
ws_Xuat.Range("B" & startRow_Xuat + 1 & ":I" & lastRow_Xuat).Copy
On Error GoTo 2
ws_LuuXuat.Range("B" & lastRow_LuuXuat + 1).PasteSpecial xlPasteValues
ws_Xuat.Rows(startRow_Xuat + 2 & ":" & lastRow_Xuat + 2).EntireRow.Delete
ws_Xuat.Range("B3") = ""
ws_Xuat.Range("C3") = ""
ws_Xuat.Range("E3:I3") = ""
'ws_Xuat.Range("D3").FormulaR1C1 = "=IFERROR(VLOOKUP([Mã hàng],DMHH,2,0),"""")"
ws_Xuat.Range("D3") = ""


End If
lastRow_LuuXuat = Excel.WorksheetFunction.CountA(ws_LuuXuat.Range("C:C")) + startRow_LuuXuat - 1
ws_LuuXuat.Range("B3:I3").Copy
ws_LuuXuat.Range("B3:I" & lastRow_LuuXuat).PasteSpecial Paste:=xlPasteFormats, Operation:=xlNone, SkipBlanks:=False, Transpose:=False
Application.CutCopyMode = False
2    ActiveSheet.DisplayPageBreaks = PageBreakState
Application.Calculation = CalcState
Application.EnableEvents = EventState
Application.ScreenUpdating = True
End Sub

Sub XuatBOM()
If Date > 46421 Then
Exit Sub
End If

Application.ScreenUpdating = False
EventState = Application.EnableEvents
Application.EnableEvents = False
CalcState = Application.Calculation
Application.Calculation = xlCalculationAutomatic
PageBreakState = ActiveSheet.DisplayPageBreaks
ActiveSheet.DisplayPageBreaks = False

On erro GoTo 2

Dim ws_InBOM, ws_BOM, ws_DMHH As Worksheet
Dim startRow_BOM, lastRow_BOM, lastRow_InBOM As Double
Set ws_InBOM = ThisWorkbook.Sheets("InBOM")
Set ws_BOM = ThisWorkbook.Sheets("BOM")
Set ws_DMHH = ThisWorkbook.Sheets("Danh Muc HH")
ws_InBOM.Rows("6:10000").Delete
ws_InBOM.Range("B3") = Excel.WorksheetFunction.VLookup(ws_InBOM.Range("B4"), ws_DMHH.Range("B:F"), 2, 0)
startRow_BOM = 2
lastRow_BOM = Excel.WorksheetFunction.CountA(ws_BOM.Range("A:A"))
lastRow_InBOM = Excel.WorksheetFunction.CountA(ws_InBOM.Range("A:A"))
    Dim sp As String
   sp = ws_InBOM.Range("B4")
   For i = startRow_BOM To lastRow_BOM Step 1
   lastRow_InBOM = Excel.WorksheetFunction.CountA(ws_InBOM.Range("A:A"))
   If ws_BOM.Range("A" & i).value = sp Then
    ws_BOM.Range("B" & i).Copy
    ws_InBOM.Range("A" & lastRow_InBOM + 1).PasteSpecial xlPasteValues
    Application.CutCopyMode = False
    ws_InBOM.Range("B" & lastRow_InBOM + 1) = Excel.WorksheetFunction.VLookup(ws_InBOM.Range("A" & lastRow_InBOM + 1), ws_DMHH.Range("B:F"), 2, 0)
    ws_InBOM.Range("B" & lastRow_InBOM + 1).Copy
    ws_InBOM.Range("B" & lastRow_InBOM + 1).PasteSpecial xlPasteValues
    Application.CutCopyMode = False
        
    ws_BOM.Range("C" & i).Copy
    ws_InBOM.Range("C" & lastRow_InBOM + 1).PasteSpecial xlPasteValues
    Application.CutCopyMode = False
    
    ws_BOM.Range("D" & i).Copy
    ws_InBOM.Range("D" & lastRow_InBOM + 1).PasteSpecial xlPasteValues
    Application.CutCopyMode = False
    End If
    Next
    ws_InBOM.Range("A5:D" & lastRow_InBOM).Borders.LineStyle = xlContinuous
    Application.CutCopyMode = False
    
2
ActiveSheet.DisplayPageBreaks = PageBreakState
Application.Calculation = CalcState
Application.EnableEvents = EventState
Application.ScreenUpdating = True
End Sub
Sub TaoPhieuNL()
If Date > 46421 Then
Exit Sub
End If
'Application.ScreenUpdating = False
'EventState = Application.EnableEvents
'Application.EnableEvents = False
'CalcState = Application.Calculation
'Application.Calculation = xlCalculationAutomatic
'PageBreakState = ActiveSheet.DisplayPageBreaks
'ActiveSheet.DisplayPageBreaks = False

On erro GoTo 4

Dim ws_Phieu_NL, ws_InBOM, ws_BOM, ws_DMHH, ws_DemKho As Worksheet
Dim startRow_BOM, lastRow_BOM, startRow_InBOM, lastRow_InBOM As Double
Set ws_Phieu_NL = ThisWorkbook.Sheets("Phieu NL")

Set ws_DemKho = ThisWorkbook.Sheets("DemKho")
Set ws_InBOM = ThisWorkbook.Sheets("InBOM")
Set ws_BOM = ThisWorkbook.Sheets("BOM")
Set ws_DMHH = ThisWorkbook.Sheets("Danh Muc HH")
Dim ws_LichSX As Worksheet
Dim startRow_LichSX, lastRow_LichSX As Double
Set ws_LichSX = ThisWorkbook.Sheets("LichSX")

Dim ws_LuuXuat, ws_LuuChuyenKho, ws_LuuNhap, ws_DanhMucHH As Worksheet
Dim ws_DatLK, ws_DieuChinhKho As Worksheet

Dim startRow_DanhMucHH, lastRow_DanhMucHH As Double
Dim startRow_DatLK, lastRow_DatLK As Double

Set ws_LuuXuat = ThisWorkbook.Sheets("LuuXuat")
Set ws_LuuNhap = ThisWorkbook.Sheets("LuuNhap")
Set ws_LuuXuatSXLK = ThisWorkbook.Sheets("LuuXuatSXLK")
Set ws_LuuNhapSXTP = ThisWorkbook.Sheets("LuuNhapSXTP")
Set ws_LuuChuyenKho = ThisWorkbook.Sheets("LuuChuyenKho")
Set ws_DieuChinhKho = ThisWorkbook.Sheets("DieuChinhKho")
Set ws_TieuDe = ThisWorkbook.Sheets("TieuDe")

    
startRow_LichSX = 2
lastRow_LichSX = Excel.WorksheetFunction.CountA(ws_LichSX.Range("B:B")) + startRow_LichSX - 2
ws_Phieu_NL.Cells.Clear
ws_TieuDe.Range("B92:E95").Copy Destination:=ws_Phieu_NL.Range("B1")
ws_Phieu_NL.Rows("5:1048576").Delete
startRow_Phieu_NL = 4
lastRow_Phieu_NL = Excel.WorksheetFunction.CountA(ws_Phieu_NL.Range("B:B")) + startRow_Phieu_NL - 2

If lastRow_LichSX > startRow_LichSX Then
ws_LichSX.Range("B" & startRow_LichSX + 1 & ":E" & lastRow_LichSX).Copy
ws_Phieu_NL.Range("B" & lastRow_Phieu_NL).PasteSpecial xlPasteValues
Application.CutCopyMode = False
lastRow_Phieu_NL = Excel.WorksheetFunction.CountA(ws_Phieu_NL.Range("B:B")) + startRow_Phieu_NL - 2
ws_Phieu_NL.Range("B" & startRow_Phieu_NL + 1 & ":B" & lastRow_Phieu_NL - 1).NumberFormat = "[$-101042A]d mmmm yyyy;@"
ws_Phieu_NL.Range("B" & startRow_Phieu_NL & ":E" & lastRow_Phieu_NL - 1).Borders.LineStyle = xlContinuous

ws_TieuDe.Range("C1:J2").Copy Destination:=ws_Phieu_NL.Range("B" & lastRow_Phieu_NL + 1)
 
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
                 On erro GoTo 4
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
                                 
                                     ws_InBOM.Range("A" & k & ":D" & k).Copy
                                     ws_Phieu_NL.Range("B" & lastRow_Phieu_NL + 3).PasteSpecial xlPasteValues
                                     Application.CutCopyMode = False
                                     ws_Phieu_NL.Range("E" & lastRow_Phieu_NL + 3) = ws_InBOM.Range("D" & k) * ws_LichSX.Range("E" & j)
                        
               lastRow_Phieu_NL = lastRow_Phieu_NL + 1
1                Next k
        
    Next j
       
ws_Phieu_NL.Range("B" & PNL - 1 & ":E" & lastRow_Phieu_NL + 2).Sort Key1:=ws_Phieu_NL.Range("B" & PNL - 1 & ":B" & lastRow_Phieu_NL + 2), Order1:=xlAscending, Header:=xlYes

Dim m, SLDaNhap, SLDaNhapSXTP, TongSLDaNhap As Double
Dim SLDaXuat, SLDaXuatSXLK, TongSLDaXuat As Double
Dim SLNhap_TK, SLNhapSXTP_TK, TongSLNhap_TK As Double
Dim SLXuat_TK, SLXuatSXTP_TK, TongSLXuat_TK As Double
Dim SLDauKy, SLKhoCon As Double
Dim NgayDauThang, NgayCuoiThang As Double
NgayCuoiThang = Excel.WorksheetFunction.EoMonth(Date, 0)
NgayDauThang = Excel.WorksheetFunction.EoMonth(Date, -1) + 1
Dim SLBanTT, NgayCuoi, NgayDau, SoNgayTon As Double

Sheets("DemKho").Select
   Range("SoDoKho[#All]").Select
    ActiveWorkbook.Worksheets("DemKho").ListObjects("SoDoKho").Sort.SortFields. _
        Clear
    ActiveWorkbook.Worksheets("DemKho").ListObjects("SoDoKho").Sort.SortFields.Add _
        key:=Range("SoDoKho[Ma HH]"), SortOn:=xlSortOnValues, Order:=xlAscending _
        , DataOption:=xlSortNormal
    ActiveWorkbook.Worksheets("DemKho").ListObjects("SoDoKho").Sort.SortFields.Add _
        key:=Range("SoDoKho[Ngay Nhap]"), SortOn:=xlSortOnValues, Order:= _
        xlAscending, DataOption:=xlSortNormal
    ActiveWorkbook.Worksheets("DemKho").ListObjects("SoDoKho").Sort.SortFields.Add _
        key:=Range("SoDoKho[SL]"), SortOn:=xlSortOnValues, Order:=xlAscending, _
        DataOption:=xlSortNormal
    With ActiveWorkbook.Worksheets("DemKho").ListObjects("SoDoKho").Sort
        .Header = xlYes
        .MatchCase = False
        .Orientation = xlTopToBottom
        .SortMethod = xlPinYin
        .Apply
    End With

lastRow_Phieu_NL = Excel.WorksheetFunction.CountA(ws_Phieu_NL.Range("B:B")) + startRow_Phieu_NL - 2

            m = PNL
            Do While ws_Phieu_NL.Range("B" & m) <> ""
   
               'For m = PNL To LastRow_Phieu_NL
                n = ws_Phieu_NL.Range("E" & m)

                SLDaNhap = Excel.WorksheetFunction.SumIfs(ws_LuuNhap.Range("E:E"), ws_LuuNhap.Range("C:C"), ws_Phieu_NL.Range("B" & m), ws_LuuNhap.Range("G:G"), ws_Phieu_NL.Range("D3"), ws_LuuNhap.Range("B:B"), "<" & NgayDauThang)
                SLDaNhapCK = Excel.WorksheetFunction.SumIfs(ws_LuuChuyenKho.Range("E:E"), ws_LuuChuyenKho.Range("C:C"), ws_Phieu_NL.Range("B" & m), ws_LuuChuyenKho.Range("G:G"), ws_Phieu_NL.Range("D3"), ws_LuuChuyenKho.Range("B:B"), "<" & NgayDauThang)
                SLDaNhapSXTP = Excel.WorksheetFunction.SumIfs(ws_LuuNhapSXTP.Range("E:E"), ws_LuuNhapSXTP.Range("C:C"), ws_Phieu_NL.Range("B" & m), ws_LuuNhapSXTP.Range("F:F"), ws_Phieu_NL.Range("D3"), ws_LuuNhapSXTP.Range("B:B"), "<" & NgayDauThang)
                TongSLDaNhap = SLDaNhap + SLDaNhapCK + SLDaNhapSXTP

                SLDaXuat = Excel.WorksheetFunction.SumIfs(ws_LuuXuat.Range("E:E"), ws_LuuXuat.Range("C:C"), ws_Phieu_NL.Range("B" & m), ws_LuuXuat.Range("G:G"), ws_Phieu_NL.Range("D3"), ws_LuuXuat.Range("B:B"), "<" & NgayDauThang)
                SLDaXuatCK = Excel.WorksheetFunction.SumIfs(ws_LuuChuyenKho.Range("E:E"), ws_LuuChuyenKho.Range("C:C"), ws_Phieu_NL.Range("B" & m), ws_LuuChuyenKho.Range("F:F"), ws_Phieu_NL.Range("D3"), ws_LuuChuyenKho.Range("B:B"), "<" & NgayDauThang)
                SLDaXuatSXLK = Excel.WorksheetFunction.SumIfs(ws_LuuXuatSXLK.Range("E:E"), ws_LuuXuatSXLK.Range("C:C"), ws_Phieu_NL.Range("B" & m), ws_LuuXuatSXLK.Range("F:F"), ws_Phieu_NL.Range("D3"), ws_LuuXuatSXLK.Range("B:B"), "<" & NgayDauThang)
                TongSLDaXuat = SLDaXuat + SLDaXuatCK + SLDaXuatSXLK

                SLDieuChinh = Excel.WorksheetFunction.SumIfs(ws_DieuChinhKho.Range("E:E"), ws_DieuChinhKho.Range("C:C"), ws_Phieu_NL.Range("B" & m), ws_DieuChinhKho.Range("G:G"), ws_Phieu_NL.Range("D3"))

                SLDauKy = TongSLDaNhap - TongSLDaXuat + SLDieuChinh

                SLNhap_TK = Excel.WorksheetFunction.SumIfs(ws_LuuNhap.Range("E:E"), ws_LuuNhap.Range("C:C"), ws_Phieu_NL.Range("B" & m), ws_LuuNhap.Range("G:G"), ws_Phieu_NL.Range("D3"), ws_LuuNhap.Range("B:B"), ">=" & NgayDauThang, ws_LuuNhap.Range("B:B"), "<=" & NgayCuoiThang)
                SLNhapCK_TK = Excel.WorksheetFunction.SumIfs(ws_LuuChuyenKho.Range("E:E"), ws_LuuChuyenKho.Range("C:C"), ws_Phieu_NL.Range("B" & m), ws_LuuChuyenKho.Range("G:G"), ws_Phieu_NL.Range("D3"), ws_LuuChuyenKho.Range("B:B"), ">=" & NgayDauThang, ws_LuuChuyenKho.Range("B:B"), "<=" & NgayCuoiThang)
                SLNhapSXTP_TK = Excel.WorksheetFunction.SumIfs(ws_LuuNhapSXTP.Range("E:E"), ws_LuuNhapSXTP.Range("C:C"), ws_Phieu_NL.Range("B" & m), ws_LuuNhapSXTP.Range("F:F"), ws_Phieu_NL.Range("D3"), ws_LuuNhapSXTP.Range("B:B"), ">=" & NgayDauThang, ws_LuuNhapSXTP.Range("B:B"), "<=" & NgayCuoiThang)
                TongSLNhap_TK = SLNhap_TK + SLNhapCK_TK + SLNhapSXTP_TK

                SLXuat_TK = Excel.WorksheetFunction.SumIfs(ws_LuuXuat.Range("E:E"), ws_LuuXuat.Range("C:C"), ws_Phieu_NL.Range("B" & m), ws_LuuXuat.Range("G:G"), ws_Phieu_NL.Range("D3"), ws_LuuXuat.Range("B:B"), ">=" & NgayDauThang, ws_LuuXuat.Range("B:B"), "<=" & NgayCuoiThang)
                SLXuatCK_TK = Excel.WorksheetFunction.SumIfs(ws_LuuChuyenKho.Range("E:E"), ws_LuuChuyenKho.Range("C:C"), ws_Phieu_NL.Range("B" & m), ws_LuuChuyenKho.Range("F:F"), ws_Phieu_NL.Range("D3"), ws_LuuChuyenKho.Range("B:B"), ">=" & NgayDauThang, ws_LuuChuyenKho.Range("B:B"), "<=" & NgayCuoiThang)
                SLXuatSXLK_TK = Excel.WorksheetFunction.SumIfs(ws_LuuXuatSXLK.Range("E:E"), ws_LuuXuatSXLK.Range("C:C"), ws_Phieu_NL.Range("B" & m), ws_LuuXuatSXLK.Range("F:F"), ws_Phieu_NL.Range("D3"), ws_LuuXuatSXLK.Range("B:B"), ">=" & NgayDauThang, ws_LuuXuatSXLK.Range("B:B"), "<=" & NgayCuoiThang)
                TongSLXuat_TK = SLXuat_TK + SLXuatCK_TK + SLXuatSXLK_TK

                SLKhoCon = SLDauKy + TongSLNhap_TK - TongSLXuat_TK
                TonThucTe = Excel.WorksheetFunction.SumIfs(ws_DemKho.Range("G:G"), ws_DemKho.Range("B:B"), ws_Phieu_NL.Range("B" & m))
   
   If TonThucTe < n Then
   MsgBox ("Ton Thuc Te khong co du loai hang:" & ws_Phieu_NL.Range("B" & m))
   End If
   
  
    Dim startRow_DemKho, lastRow_DemKho As Double
    startRow_DemKho = 3
lastRow_DemKho = Excel.WorksheetFunction.CountA(ws_DemKho.Range("B:B"))


  For q = startRow_DemKho To lastRow_DemKho
2     If ws_DemKho.Range("B" & q).value = ws_Phieu_NL.Range("B" & m) Then
                            If ws_DemKho.Range("G" & q).value > 0 And ws_DemKho.Range("G" & q).value < n Then
                                        ws_Phieu_NL.Range("F" & m) = ws_DemKho.Range("E" & q)
                                        ws_Phieu_NL.Range("G" & m) = ws_DemKho.Range("G" & q).value
                                        ws_Phieu_NL.Range("D" & m) = SLKhoCon - ws_Phieu_NL.Range("G" & m)
                                        ws_Phieu_NL.Range("H" & m) = TonThucTe - ws_Phieu_NL.Range("G" & m)
                                        
                                        
                                        ws_Phieu_NL.Range("B" & m & ":I" & m).Copy
                                        ws_Phieu_NL.Range("B" & m & ":I" & m).Insert Shift:=xlDown
                                        Application.CutCopyMode = False
                                        SLKhoCon = SLKhoCon - ws_Phieu_NL.Range("G" & m)
                                        TonThucTe = TonThucTe - ws_Phieu_NL.Range("G" & m)
                                        n = n - ws_Phieu_NL.Range("G" & m)
                                        m = m + 1
                                        q = q + 1
                                       GoTo 2
                            Else
                              If ws_DemKho.Range("G" & q).value >= n Then
                            ws_Phieu_NL.Range("F" & m) = ws_DemKho.Range("E" & q)
                            ws_Phieu_NL.Range("G" & m) = n
                            ws_Phieu_NL.Range("D" & m) = SLKhoCon - n
                            ws_Phieu_NL.Range("H" & m) = TonThucTe - n
                              Else
                              GoTo 31
                              End If
                            End If
                            GoTo 3
                            
    
    End If
31 Next q
3  m = m + 1
 Loop
'Next m





lastRow_Phieu_NL = Excel.WorksheetFunction.CountA(ws_Phieu_NL.Range("B:B")) + startRow_Phieu_NL - 2
ws_Phieu_NL.Range("B" & PNL - 1 & ":I" & lastRow_Phieu_NL).Borders.LineStyle = xlContinuous



ActiveWorkbook.Worksheets("Phieu NL").Sort.SortFields.Clear
ActiveWorkbook.Worksheets("Phieu NL").Sort.SortFields.Add key:=Range("F" & PNL - 1 & ":F" & lastRow_Phieu_NL), SortOn:=xlSortOnValues, Order:=xlAscending, DataOption:=xlSortNormal
    With ActiveWorkbook.Worksheets("Phieu NL").Sort
        .SetRange Range("B" & PNL - 1 & ":I" & lastRow_Phieu_NL)
        .Header = xlYes
        .MatchCase = False
        .Orientation = xlTopToBottom
        .SortMethod = xlPinYin
        .Apply
    End With

ThisWorkbook.Sheets("Phieu NL").Visible = xlSheetVisible
ThisWorkbook.Sheets("Phieu NL").Activate
ws_Phieu_NL.Range("B" & lastRow_Phieu_NL + 1) = Sheets("TieuDe").Range("C4")
ws_Phieu_NL.Range("D" & lastRow_Phieu_NL + 1) = Sheets("TieuDe").Range("D4")
 Call RemoveQR
         ws_Phieu_NL.Range("D2") = "Ma Lenh Xuat"
         ws_Phieu_NL.Range("E2") = "XLKSX" & Format(Now(), "DDMMYY hh:mm")
         ws_Phieu_NL.Range("E2").Select
         Call AddQR
        ws_Phieu_NL.Range("F2").Select
        Selection.RowHeight = 80
        Range("B2:F2").Select
        With Selection
            .HorizontalAlignment = xlCenter
            .VerticalAlignment = xlCenter
        End With
        With Selection.Font
            .Name = "Times New Roman"
            .FontStyle = "Bold"
            .Size = 14
        End With
        Columns("B:I").EntireColumn.AutoFit

End If
Dim lastRow_DonXuatLKSX, g As Long
Dim cc As Long
Dim ws_DonXuatLKSX As Worksheet
Set ws_DonXuatLKSX = ThisWorkbook.Sheets("DonXuatLKSX")

'lastRow_DonXuatLKSX = Excel.WorksheetFunction.CountA(ws_DonXuatLKSX.Range("B:B"))
'
'For d = 2 To lastRow_DonXuatLKSX
'If ws_DonXuatLKSX.Range("B" & d) = ws_Phieu_NL.Range("E2") Then
' MsgBox ("Don hang nay da cap nhat:" & ws_Phieu_NL.Range("E2") & "Se xoa don da cap nhat truoc do")
'ws_DonXuatLKSX.Range("B" & d).EntireRow.Delete
'   End If
'Next d

lastRow_DonXuatLKSX = Excel.WorksheetFunction.CountA(ws_DonXuatLKSX.Range("B:B"))
cc = lastRow_DonXuatLKSX + 1

For g = PNL To lastRow_Phieu_NL
ws_DonXuatLKSX.Range("B" & cc) = ws_Phieu_NL.Range("E2")
ws_DonXuatLKSX.Range("C" & cc) = ws_Phieu_NL.Range("B" & g)
ws_DonXuatLKSX.Range("D" & cc) = ws_Phieu_NL.Range("G" & g)
ws_DonXuatLKSX.Range("E" & cc) = ws_Phieu_NL.Range("F" & g)
ws_DonXuatLKSX.Range("A" & cc) = ws_DonXuatLKSX.Range("B" & cc) & "_" & cc
cc = cc + 1
Next g



 
4
'ActiveSheet.DisplayPageBreaks = PageBreakState
'Application.Calculation = CalcState
'Application.EnableEvents = EventState
'Application.ScreenUpdating = True
End Sub

Sub Luu_SanXuat()
If Date > 46421 Then
Exit Sub
End If
Application.ScreenUpdating = False
EventState = Application.EnableEvents
Application.EnableEvents = False
CalcState = Application.Calculation
Application.Calculation = xlCalculationAutomatic
PageBreakState = ActiveSheet.DisplayPageBreaks
ActiveSheet.DisplayPageBreaks = False

On erro GoTo 2

Dim ws_LichSX, ws_LuuNhapSXTP, ws_LuuXuatSXLK, ws_Phieu_NL As Worksheet
Dim startRow_LichSX, startRow_LuuNhapSXTP, lastRow_LichSX, lastRow_LuuNhapSXTP As Double
Set ws_LichSX = ThisWorkbook.Sheets("LichSX")
Set ws_LuuNhapSXTP = ThisWorkbook.Sheets("LuuNhapSXTP")
Set ws_LuuXuatSXLK = ThisWorkbook.Sheets("LuuXuatSXLK")
Set ws_Phieu_NL = ThisWorkbook.Sheets("Phieu NL")
Dim ws_DanhMucHH As Worksheet
Set ws_DanhMucHH = ThisWorkbook.Sheets("Danh Muc HH")
lastRow_LichSX = Excel.WorksheetFunction.CountA(ws_LichSX.Range("C:C")) + startRow_LichSX - 1

Dim ws_DemKho As Worksheet
Set ws_DemKho = ThisWorkbook.Sheets("DemKho")
Dim i, l As Integer

For i = 3 To lastRow_LichSX
        If Excel.WorksheetFunction.CountIfs(ws_DanhMucHH.Range("B:B"), ws_LichSX.Range("C" & i)) = 0 Then
               MsgBox "Ma so nay chua ton tai trong Danh muc Hang hoa"
        GoTo 2
        End If
Next i
        


        startRow_LichSX = 2
        startRow_LuuNhapSXTP = 2
        startRow_LuuXuatSXLK = 2
        
        lastRow_LichSX = Excel.WorksheetFunction.CountA(ws_LichSX.Range("C:C")) + startRow_LichSX - 1
        lastRow_LuuNhapSXTP = Excel.WorksheetFunction.CountA(ws_LuuNhapSXTP.Range("C:C")) + startRow_LuuNhapSXTP - 1
        lastRow_LuuXuatSXLK = Excel.WorksheetFunction.CountA(ws_LuuXuatSXLK.Range("C:C")) + startRow_LuuXuatSXLK - 1
If lastRow_LichSX > startRow_LichSX Then

 
 For l = 3 To lastRow_LichSX
 lastRow_DemKho = Excel.WorksheetFunction.CountA(ws_DemKho.Range("B:B"))
 ws_DemKho.Range("B" & lastRow_DemKho + 1) = ws_LichSX.Range("C" & l)
 ws_DemKho.Range("C" & lastRow_DemKho + 1) = ws_LichSX.Range("D" & l)
 ws_DemKho.Range("D" & lastRow_DemKho + 1) = Excel.WorksheetFunction.VLookup(ws_DemKho.Range("B" & lastRow_DemKho + 1), ws_DanhMucHH.Range("B:F"), 3, 0)
 ws_DemKho.Range("E" & lastRow_DemKho + 1) = "SX9"
 ws_DemKho.Range("F" & lastRow_DemKho + 1) = ws_LichSX.Range("B" & l)
 ws_DemKho.Range("G" & lastRow_DemKho + 1) = ws_LichSX.Range("E" & l)
 Next l


ws_LichSX.Range("B" & startRow_LichSX + 1 & ":F" & lastRow_LichSX).Copy
ws_LuuNhapSXTP.Range("B" & lastRow_LuuNhapSXTP + 1).PasteSpecial xlPasteValues
lastRow_LuuNhapSXTP = Excel.WorksheetFunction.CountA(ws_LuuNhapSXTP.Range("C:C")) + startRow_LuuNhapSXTP - 1
ws_LuuNhapSXTP.Range("B3:F3").Copy
ws_LuuNhapSXTP.Range("B3:F" & lastRow_LuuNhapSXTP).PasteSpecial Paste:=xlPasteFormats, Operation:=xlNone, SkipBlanks:=False, Transpose:=False
Application.CutCopyMode = False

'Call TaoPhieuNL
Dim ws_InBOM, ws_BOM, ws_DMHH As Worksheet
Dim startRow_BOM, lastRow_BOM, startRow_InBOM, lastRow_InBOM As Double
Set ws_Phieu_NL = ThisWorkbook.Sheets("Phieu NL")
Set ws_InBOM = ThisWorkbook.Sheets("InBOM")
Set ws_BOM = ThisWorkbook.Sheets("BOM")
Set ws_DMHH = ThisWorkbook.Sheets("Danh Muc HH")
Set ws_LichSX = ThisWorkbook.Sheets("LichSX")

Dim ws_LuuXuat, ws_LuuChuyenKho, ws_LuuNhap, ws_TieuDe As Worksheet
Dim ws_DatLK, ws_DieuChinhKho As Worksheet

Dim startRow_DanhMucHH, lastRow_DanhMucHH As Double
Dim startRow_DatLK, lastRow_DatLK As Double

Set ws_LuuXuat = ThisWorkbook.Sheets("LuuXuat")
Set ws_LuuNhap = ThisWorkbook.Sheets("LuuNhap")
Set ws_LuuXuatSXLK = ThisWorkbook.Sheets("LuuXuatSXLK")
Set ws_LuuNhapSXTP = ThisWorkbook.Sheets("LuuNhapSXTP")
Set ws_LuuChuyenKho = ThisWorkbook.Sheets("LuuChuyenKho")
Set ws_DieuChinhKho = ThisWorkbook.Sheets("DieuChinhKho")
Set ws_TieuDe = ThisWorkbook.Sheets("TieuDe")

startRow_LichSX = 2
lastRow_LichSX = Excel.WorksheetFunction.CountA(ws_LichSX.Range("B:B")) + startRow_LichSX - 2
ws_Phieu_NL.Rows("5:1048576").Delete

startRow_Phieu_NL = 4
lastRow_Phieu_NL = Excel.WorksheetFunction.CountA(ws_Phieu_NL.Range("B:B")) + startRow_Phieu_NL - 2

ws_LichSX.Range("B" & startRow_LichSX + 1 & ":E" & lastRow_LichSX).Copy
ws_Phieu_NL.Range("B" & lastRow_Phieu_NL).PasteSpecial xlPasteValues
Application.CutCopyMode = False
lastRow_Phieu_NL = Excel.WorksheetFunction.CountA(ws_Phieu_NL.Range("B:B")) + startRow_Phieu_NL - 2
ws_Phieu_NL.Range("B" & startRow_Phieu_NL + 1 & ":B" & lastRow_Phieu_NL - 1).NumberFormat = "[$-101042A]d mmmm yyyy;@"
ws_Phieu_NL.Range("B" & startRow_Phieu_NL & ":E" & lastRow_Phieu_NL - 1).Borders.LineStyle = xlContinuous
ws_TieuDe.Range("C1:F2").Copy Destination:=ws_Phieu_NL.Range("B" & lastRow_Phieu_NL + 1)

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
                On erro GoTo 2
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
                                
                                                  ws_InBOM.Range("A" & k & ":D" & k).Copy
                         ws_Phieu_NL.Range("B" & lastRow_Phieu_NL + 3).PasteSpecial xlPasteValues
                         Application.CutCopyMode = False
                         ws_Phieu_NL.Range("E" & lastRow_Phieu_NL + 3) = ws_InBOM.Range("D" & k) * ws_LichSX.Range("E" & j)
                         lastRow_Phieu_NL = lastRow_Phieu_NL + 1
1                        Next k
               Next j
       
ws_Phieu_NL.Range("B" & PNL - 1 & ":E" & lastRow_Phieu_NL + 2).Sort Key1:=ws_Phieu_NL.Range("B" & PNL - 1 & ":B" & lastRow_Phieu_NL + 2), Order1:=xlAscending, Header:=xlYes

Dim m, SLDaNhap, SLDaNhapSXTP, TongSLDaNhap As Double
Dim SLDaXuat, SLDaXuatSXLK, TongSLDaXuat As Double
Dim SLNhap_TK, SLNhapSXTP_TK, TongSLNhap_TK As Double
Dim SLXuat_TK, SLXuatSXTP_TK, TongSLXuat_TK As Double
Dim SLDauKy, SLKhoCon As Double
Dim NgayDauThang, NgayCuoiThang As Double
NgayCuoiThang = Excel.WorksheetFunction.EoMonth(Date, 0)
NgayDauThang = Excel.WorksheetFunction.EoMonth(Date, -1) + 1
Dim SLBanTT, NgayCuoi, NgayDau, SoNgayTon As Double

lastRow_Phieu_NL = Excel.WorksheetFunction.CountA(ws_Phieu_NL.Range("B:B")) + startRow_Phieu_NL - 2
                    For m = PNL To lastRow_Phieu_NL Step 1
                    n = ws_Phieu_NL.Range("E" & m)
                    
                    SLDaNhap = Excel.WorksheetFunction.SumIfs(ws_LuuNhap.Range("E:E"), ws_LuuNhap.Range("C:C"), ws_Phieu_NL.Range("B" & m), ws_LuuNhap.Range("G:G"), ws_Phieu_NL.Range("D3"), ws_LuuNhap.Range("B:B"), "<" & NgayDauThang)
                    SLDaNhapCK = Excel.WorksheetFunction.SumIfs(ws_LuuChuyenKho.Range("E:E"), ws_LuuChuyenKho.Range("C:C"), ws_Phieu_NL.Range("B" & m), ws_LuuChuyenKho.Range("G:G"), ws_Phieu_NL.Range("D3"), ws_LuuChuyenKho.Range("B:B"), "<" & NgayDauThang)
                    SLDaNhapSXTP = Excel.WorksheetFunction.SumIfs(ws_LuuNhapSXTP.Range("E:E"), ws_LuuNhapSXTP.Range("C:C"), ws_Phieu_NL.Range("B" & m), ws_LuuNhapSXTP.Range("F:F"), ws_Phieu_NL.Range("D3"), ws_LuuNhapSXTP.Range("B:B"), "<" & NgayDauThang)
                    TongSLDaNhap = SLDaNhap + SLDaNhapCK + SLDaNhapSXTP
                    
                    SLDaXuat = Excel.WorksheetFunction.SumIfs(ws_LuuXuat.Range("E:E"), ws_LuuXuat.Range("C:C"), ws_Phieu_NL.Range("B" & m), ws_LuuXuat.Range("G:G"), ws_Phieu_NL.Range("D3"), ws_LuuXuat.Range("B:B"), "<" & NgayDauThang)
                    SLDaXuatCK = Excel.WorksheetFunction.SumIfs(ws_LuuChuyenKho.Range("E:E"), ws_LuuChuyenKho.Range("C:C"), ws_Phieu_NL.Range("B" & m), ws_LuuChuyenKho.Range("F:F"), ws_Phieu_NL.Range("D3"), ws_LuuChuyenKho.Range("B:B"), "<" & NgayDauThang)
                    SLDaXuatSXLK = Excel.WorksheetFunction.SumIfs(ws_LuuXuatSXLK.Range("E:E"), ws_LuuXuatSXLK.Range("C:C"), ws_Phieu_NL.Range("B" & m), ws_LuuXuatSXLK.Range("F:F"), ws_Phieu_NL.Range("D3"), ws_LuuXuatSXLK.Range("B:B"), "<" & NgayDauThang)
                    TongSLDaXuat = SLDaXuat + SLDaXuatCK + SLDaXuatSXLK
                    
                    SLDieuChinh = Excel.WorksheetFunction.SumIfs(ws_DieuChinhKho.Range("E:E"), ws_DieuChinhKho.Range("C:C"), ws_Phieu_NL.Range("B" & m), ws_DieuChinhKho.Range("G:G"), ws_Phieu_NL.Range("D3"))
                    
                    SLDauKy = TongSLDaNhap - TongSLDaXuat + SLDieuChinh
                    
                    SLNhap_TK = Excel.WorksheetFunction.SumIfs(ws_LuuNhap.Range("E:E"), ws_LuuNhap.Range("C:C"), ws_Phieu_NL.Range("B" & m), ws_LuuNhap.Range("G:G"), ws_Phieu_NL.Range("D3"), ws_LuuNhap.Range("B:B"), ">=" & NgayDauThang, ws_LuuNhap.Range("B:B"), "<=" & NgayCuoiThang)
                    SLNhapCK_TK = Excel.WorksheetFunction.SumIfs(ws_LuuChuyenKho.Range("E:E"), ws_LuuChuyenKho.Range("C:C"), ws_Phieu_NL.Range("B" & m), ws_LuuChuyenKho.Range("G:G"), ws_Phieu_NL.Range("D3"), ws_LuuChuyenKho.Range("B:B"), ">=" & NgayDauThang, ws_LuuChuyenKho.Range("B:B"), "<=" & NgayCuoiThang)
                    SLNhapSXTP_TK = Excel.WorksheetFunction.SumIfs(ws_LuuNhapSXTP.Range("E:E"), ws_LuuNhapSXTP.Range("C:C"), ws_Phieu_NL.Range("B" & m), ws_LuuNhapSXTP.Range("F:F"), ws_Phieu_NL.Range("D3"), ws_LuuNhapSXTP.Range("B:B"), ">=" & NgayDauThang, ws_LuuNhapSXTP.Range("B:B"), "<=" & NgayCuoiThang)
                    TongSLNhap_TK = SLNhap_TK + SLNhapCK_TK + SLNhapSXTP_TK
                    
                    SLXuat_TK = Excel.WorksheetFunction.SumIfs(ws_LuuXuat.Range("E:E"), ws_LuuXuat.Range("C:C"), ws_Phieu_NL.Range("B" & m), ws_LuuXuat.Range("G:G"), ws_Phieu_NL.Range("D3"), ws_LuuXuat.Range("B:B"), ">=" & NgayDauThang, ws_LuuXuat.Range("B:B"), "<=" & NgayCuoiThang)
                    SLXuatCK_TK = Excel.WorksheetFunction.SumIfs(ws_LuuChuyenKho.Range("E:E"), ws_LuuChuyenKho.Range("C:C"), ws_Phieu_NL.Range("B" & m), ws_LuuChuyenKho.Range("F:F"), ws_Phieu_NL.Range("D3"), ws_LuuChuyenKho.Range("B:B"), ">=" & NgayDauThang, ws_LuuChuyenKho.Range("B:B"), "<=" & NgayCuoiThang)
                    SLXuatSXLK_TK = Excel.WorksheetFunction.SumIfs(ws_LuuXuatSXLK.Range("E:E"), ws_LuuXuatSXLK.Range("C:C"), ws_Phieu_NL.Range("B" & m), ws_LuuXuatSXLK.Range("F:F"), ws_Phieu_NL.Range("D3"), ws_LuuXuatSXLK.Range("B:B"), ">=" & NgayDauThang, ws_LuuXuatSXLK.Range("B:B"), "<=" & NgayCuoiThang)
                    TongSLXuat_TK = SLXuat_TK + SLXuatCK_TK + SLXuatSXLK_TK
                    
                    SLKhoCon = SLDauKy + TongSLNhap_TK - TongSLXuat_TK - n
                    ws_Phieu_NL.Range("D" & m) = SLKhoCon
                    Next m
lastRow_Phieu_NL = Excel.WorksheetFunction.CountA(ws_Phieu_NL.Range("B:B")) + startRow_Phieu_NL - 2
ws_Phieu_NL.Range("B" & PNL & ":E" & lastRow_Phieu_NL).Borders.LineStyle = xlContinuous

 ' ket thuc TaoPhieuNL
lastRow_LuuXuatSXLK = Excel.WorksheetFunction.CountA(ws_LuuXuatSXLK.Range("C:C")) + 2
Dim startRowTam As Double
startRowTam = Excel.WorksheetFunction.CountA(ws_LuuXuatSXLK.Range("C:C")) + 2

ws_Phieu_NL.Range("B" & PNL & ":C" & lastRow_Phieu_NL + 2).Copy
ws_LuuXuatSXLK.Range("C" & lastRow_LuuXuatSXLK).PasteSpecial Paste:=xlPasteValues
        Application.CutCopyMode = False

ws_Phieu_NL.Range("E" & PNL & ":E" & lastRow_Phieu_NL + 2).Copy
ws_LuuXuatSXLK.Range("E" & lastRow_LuuXuatSXLK).PasteSpecial Paste:=xlPasteValues
        Application.CutCopyMode = False

lastRow_LuuXuatSXLK = Excel.WorksheetFunction.CountA(ws_LuuXuatSXLK.Range("C:C")) + 2

ws_Phieu_NL.Range("B5").Copy
ws_LuuXuatSXLK.Range("B" & startRowTam & ":B" & lastRow_LuuXuatSXLK - 1).PasteSpecial Paste:=xlPasteValues
        Application.CutCopyMode = False
ws_LuuXuatSXLK.Range("F" & startRowTam & ":F" & lastRow_LuuXuatSXLK - 1) = ws_Phieu_NL.Range("D3")

ws_LichSX.Rows(startRow_LichSX + 1 & ":" & lastRow_LichSX + 2).EntireRow.Delete

End If
Call TonKho
2        ActiveSheet.DisplayPageBreaks = PageBreakState
Application.Calculation = CalcState
Application.EnableEvents = EventState
Application.ScreenUpdating = True
End Sub
Sub DanhSachThanhPham()
Application.ScreenUpdating = False
EventState = Application.EnableEvents
Application.EnableEvents = False
CalcState = Application.Calculation
Application.Calculation = xlCalculationAutomatic
PageBreakState = ActiveSheet.DisplayPageBreaks
ActiveSheet.DisplayPageBreaks = False
On erro GoTo 2

Dim ws_BOM, ws_DanhSachTP As Worksheet
Set ws_BOM = ThisWorkbook.Sheets("BOM")
Set ws_DanhSachTP = ThisWorkbook.Sheets("DanhSachTP")
Dim ws_DMHH As Worksheet
Set ws_DMHH = ThisWorkbook.Sheets("Danh Muc HH")

Dim rng As Range
Dim LastRow_DanhSachTP As Long
Dim i, j As Integer
On Error Resume Next
Set rng = ws_BOM.Range("A:A")
If rng Is Nothing Then GoTo 2
On Error Resume Next
rng.Copy ws_DanhSachTP.Range("A1")
ws_DanhSachTP.Range("A:A").RemoveDuplicates Columns:=1, Header:=xlNo
LastRow_DanhSachTP = ws_DanhSachTP.Cells(Rows.count, "A").End(xlUp).Row
For i = 1 To LastRow_DanhSachTP
  If ws_DanhSachTP.Range("A:A").Cells(i).value = "" Then
     ws_DanhSachTP.Range("A:A").Cells(i).Delete
  End If
Next i
LastRow_DanhSachTP = ws_DanhSachTP.Cells(Rows.count, "A").End(xlUp).Row

For j = 2 To LastRow_DanhSachTP
  If ws_DanhSachTP.Range("A:A").Cells(j).value <> "" Then
     ws_DanhSachTP.Range("B:B").Cells(j).value = Excel.WorksheetFunction.VLookup(ws_DanhSachTP.Range("A:A").Cells(j), ws_DMHH.Range("B:C"), 2, 0)
  End If
  ws_DanhSachTP.Range("B1") = "Ten Thanh Pham"
  Next j
2       ActiveSheet.DisplayPageBreaks = PageBreakState
Application.Calculation = CalcState
Application.EnableEvents = EventState
Application.ScreenUpdating = True
End Sub
Sub Cap_Quyen()
'Check User
If Sheet20.Range("C3") = "sai" Then
MsgBox "Sai User", , "Sai Roi"
Exit Sub
End If
If Sheet20.Range("C4") = "sai" Then
MsgBox "Sai Password", , "Sai Roi"
Exit Sub
End If

Application.Visible = True
Bang_Dang_Nhap.Hide
Dim ws As Worksheet
Dim lr As Long
   lr = 1
  For Each ws In ThisWorkbook.Worksheets
  If ws.Name <> "GiaoDien" Then
  With Sheets(ws.Name)
     If .FilterMode Then .AutoFilterMode = False
  End With
                  If Sheets(ws.Name).Visible = xlSheetHidden Then
                                  Sheets(ws.Name).Visible = xlSheetVisible
                              
                End If
                    lr = lr + 1
            End If
  Next ws

'Sheet2.Visible = xlSheetVisible
'
'Sheet14.Visible = xlSheetVisible
'
'Sheet26.Visible = xlSheetVisible
'
'Sheet27.Visible = xlSheetVisible
'
'Sheet29.Visible = xlSheetVisible
'
'Sheet37.Visible = xlSheetVisible
'
'Sheet38.Visible = xlSheetVisible
'
'Sheet41.Visible = xlSheetVisible




'Sheet20.Cells(6, 8) = Sheet1.Name
'Sheet20.Cells(6, 9) = Sheet2.Name
'Sheet20.Cells(6, 10) = Sheet3.Name
'Sheet20.Cells(6, 11) = Sheet4.Name
'Sheet20.Cells(6, 12) = Sheet5.Name
'Sheet20.Cells(6, 13) = Sheet6.Name
'Sheet20.Cells(6, 14) = Sheet7.Name
'Sheet20.Cells(6, 15) = Sheet8.Name
'Sheet20.Cells(6, 16) = Sheet9.Name
'Sheet20.Cells(6, 17) = Sheet10.Name
'Sheet20.Cells(6, 18) = Sheet11.Name
'Sheet20.Cells(6, 19) = Sheet12.Name
'Sheet20.Cells(6, 20) = Sheet13.Name
'Sheet20.Cells(6, 21) = Sheet14.Name
'Sheet20.Cells(6, 22) = Sheet15.Name
'Sheet20.Cells(6, 23) = Sheet16.Name
'Sheet20.Cells(6, 24) = Sheet17.Name
'Sheet20.Cells(6, 25) = Sheet18.Name
'Sheet20.Cells(6, 26) = Sheet19.Name
'Sheet20.Cells(6, 27) = Sheet20.Name
'Sheet20.Cells(6, 28) = Sheet21.Name
'Sheet20.Cells(6, 29) = Sheet22.Name
'Sheet20.Cells(6, 30) = Sheet23.Name
'Sheet20.Cells(6, 31) = Sheet24.Name
'Sheet20.Cells(6, 32) = Sheet25.Name
'Sheet20.Cells(6, 33) = Sheet26.Name
'Sheet20.Cells(6, 34) = Sheet28.Name

'
'Dim h, c As Integer
'Dim ts As String
'h = Sheet20.Range("C3")
'For c = 8 To 34
'ts = Sheet20.Cells(6, c)
''Duoc xem va chinh sua
'If Sheet20.Cells(h, c) = 1 Then
'Sheets(ts).Visible = xlSheetVisible
''Sheets(ts).Unprotect "BiMat"
'End If
''Duoc xem nhung khong chinh sua
'If Sheet20.Cells(h, c) = 2 Then
'Sheets(ts).Visible = xlSheetVisible
''Sheets(ts).Protect "BiMat"
'End If
''Khong duoc xem
'If Sheet20.Cells(h, c) = 3 Then
'Sheets(ts).Visible = xlSheetVeryHidden
'End If
'Next





End Sub
Sub CopySheetTo()
    Dim wb As Workbook 'File Dich
    Dim sh As Worksheet, sFileName As String
    
Application.ScreenUpdating = False
EventState = Application.EnableEvents
Application.EnableEvents = False
CalcState = Application.Calculation
Application.Calculation = xlCalculationAutomatic
PageBreakState = ActiveSheet.DisplayPageBreaks
ActiveSheet.DisplayPageBreaks = False
    
    On Error GoTo lbFinally
    
    For Each sh In ActiveWindow.SelectedSheets 'Quet vao tung sheet dang chon
        sFileName = sh.Range("F1") & ".xlsx"
        If Not GetWb(sFileName, wb) Then 'Kiem tra ten File co dang duoc mo khong?
            Set wb = CreateNewWb(sFileName)
        End If
        sh.Copy wb.Sheets(1)
    Next sh
    
lbFinally:
ActiveSheet.DisplayPageBreaks = PageBreakState
Application.Calculation = CalcState
Application.EnableEvents = EventState
Application.ScreenUpdating = True
   
    If Err <> 0 Then
        MsgBox Err.Description, vbCritical
    End If
End Sub

'Neu GetWb=True, thi Wb tro vao workbook co sWbName
'Neu GetWb=False, chua tung co file voi ten sWbName
Function GetWb(sWbName As String, wb As Workbook) As Boolean
    Dim i As Long
    sWbName = LCase(sWbName)
    For i = 1 To Workbooks.count
        If LCase(Workbooks(i).Name) = sWbName Then
            GetWb = True
            Set wb = Workbooks(i)
            Exit Function
        End If
    Next i
End Function

Function CreateNewWb(sWbName As String) As Workbook
    Dim oldWb As Workbook
    Set oldWb = ActiveWorkbook
    Set CreateNewWb = Workbooks.Add 'Tao moi workbook
    CreateNewWb.SaveAs sWbName
    oldWb.Activate
    
End Function

Sub In_Tat_BOM()
If Date > 46421 Then
Exit Sub
End If
Application.ScreenUpdating = False
EventState = Application.EnableEvents
Application.EnableEvents = False
CalcState = Application.Calculation
Application.Calculation = xlCalculationAutomatic
PageBreakState = ActiveSheet.DisplayPageBreaks
ActiveSheet.DisplayPageBreaks = False
On erro GoTo 2

Dim h, c As Integer
h = Sheet20.Range("C3")
c = 39
If Sheet20.Cells(h, c) = "Y" Then

Dim ws_DanhSachTP As Worksheet
Set ws_DanhSachTP = ThisWorkbook.Sheets("DanhSachTP")
Dim ws_InBOM As Worksheet
Set ws_InBOM = ThisWorkbook.Sheets("InBOM")
Dim m As Double
    m = Excel.WorksheetFunction.CountA(ws_DanhSachTP.Range("A:A")) - 1
    Dim j As Integer
                        j = 2
                    Do Until j = m
                    ws_InBOM.Range("B4") = ws_DanhSachTP.Range("A" & j)
                       
                    Dim ws_BOM, ws_DMHH As Worksheet
                    Dim startRow_BOM, lastRow_BOM, lastRow_InBOM As Double
                    Set ws_BOM = ThisWorkbook.Sheets("BOM")
                    Set ws_DMHH = ThisWorkbook.Sheets("Danh Muc HH")
                    ws_InBOM.Rows("6:10000").Delete
                    ws_InBOM.Range("B3") = Excel.WorksheetFunction.VLookup(ws_InBOM.Range("B4"), ws_DMHH.Range("B:F"), 2, 0)
                    startRow_BOM = 2
                    lastRow_BOM = Excel.WorksheetFunction.CountA(ws_BOM.Range("A:A"))
                    lastRow_InBOM = Excel.WorksheetFunction.CountA(ws_InBOM.Range("A:A")) + 1
                                        Dim sp As String
                                        sp = ws_InBOM.Range("B4")
                                            For i = startRow_BOM To lastRow_BOM Step 1
                                            lastRow_InBOM = Excel.WorksheetFunction.CountA(ws_InBOM.Range("A:A")) + 1
                                            If ws_BOM.Range("A" & i).value = sp Then
                                             ws_BOM.Range("B" & i).Copy
                                             ws_InBOM.Range("A" & lastRow_InBOM).PasteSpecial xlPasteValues
                                             Application.CutCopyMode = False
                                             ws_InBOM.Range("B" & lastRow_InBOM) = Excel.WorksheetFunction.VLookup(ws_InBOM.Range("A" & lastRow_InBOM), ws_DMHH.Range("B:F"), 2, 0)
                                             ws_InBOM.Range("B" & lastRow_InBOM).Copy
                                             ws_InBOM.Range("B" & lastRow_InBOM).PasteSpecial xlPasteValues
                                             Application.CutCopyMode = False
                                                 
                                             ws_BOM.Range("C" & i).Copy
                                             ws_InBOM.Range("C" & lastRow_InBOM).PasteSpecial xlPasteValues
                                             Application.CutCopyMode = False
                                             
                                             ws_BOM.Range("D" & i).Copy
                                             ws_InBOM.Range("D" & lastRow_InBOM).PasteSpecial xlPasteValues
                                             Application.CutCopyMode = False
                                             End If
                                             Next i
                        ws_InBOM.Range("A5:D" & lastRow_InBOM - 1).Borders.LineStyle = xlContinuous
                        Application.CutCopyMode = False
                      
                        Sheets("InBOM").Visible = xlSheetVisible
                        Sheets("InBOM").Select
                        ActiveSheet.PrintOut
                    
                        j = j + 1
                        Loop

 Sheets("GiaoDien").Select

Else
MsgBox ("Ban khong duoc quyen chay nut nay")
End If
2    ActiveSheet.DisplayPageBreaks = PageBreakState
Application.Calculation = CalcState
Application.EnableEvents = EventState
Application.ScreenUpdating = True
End Sub

Sub TaoPhieuNhapKho()
    ' --- 1. Cài d?t & B?o v? ---
    ' Time Bomb: Gioi han den 01/02/2027
    If Date > 46421 Then Exit Sub

    On Error GoTo ErrorHandler
    
    Application.ScreenUpdating = False
    Application.EnableEvents = False
    Dim CalcState As XlCalculation
    CalcState = Application.Calculation
    Application.Calculation = xlCalculationManual
    
    Dim PageBreakState As Boolean
    PageBreakState = ActiveSheet.DisplayPageBreaks
    ActiveSheet.DisplayPageBreaks = False

    ' --- 2. Khai báo bi?n ---
    Dim ws_PNK As Worksheet, ws_Nhap As Worksheet, ws_DMHH As Worksheet, ws_TieuDe As Worksheet
    Dim lastRow_Nhap As Long, startRow_Nhap As Long
    Dim lastRow_PNK As Long, countData As Long
    Dim rngFound As Range ' Bien dung de tim kiem o chua tieu de
    
    ' Set Sheets
    Set ws_PNK = ThisWorkbook.Sheets("PNK")
    Set ws_DMHH = ThisWorkbook.Sheets("Danh Muc HH")
    Set ws_Nhap = ThisWorkbook.Sheets("Nhap")
    Set ws_TieuDe = ThisWorkbook.Sheets("TieuDe")

    ' --- 3. Chu?n b? phi?u ---
    startRow_Nhap = 2
    lastRow_Nhap = ws_Nhap.Cells(ws_Nhap.Rows.count, "B").End(xlUp).Row

    ' Làm s?ch phi?u cu
    ws_PNK.Cells.Clear
    
    ' Copy Form M?u (Header) t? TieuDe sang PNK
    ws_TieuDe.Range("C23:L30").Copy Destination:=ws_PNK.Range("A1")
    
    ' --- ÐI?N THÔNG TIN CHUNG (Ðã s?a l?i font & c?p nh?t ô F3) ---
    
    ' 1. Ngày nh?p (B3 -> C2)
    ws_Nhap.Range("B3").Copy Destination:=ws_PNK.Range("C2")
    
    ' 2. X? lý "Ngu?n nh?p" (L?y t? ô F3)
    ' Code tìm ch? "Ngu?n nh?p:" có s?n trên form (dang hi?n th? dúng ti?ng Vi?t)
    Set rngFound = ws_PNK.Range("A1:L10").Find("Ngu?n nh?p", LookIn:=xlValues, LookAt:=xlPart)
    
    If Not rngFound Is Nothing Then
        ' QUAN TR?NG: N?i thêm d? li?u vào sau ch? có s?n.
        ' Không gõ l?i ch? "Ngu?n nh?p" trong VBA d? tránh l?i font "?".
        rngFound.value = rngFound.value & " " & ws_Nhap.Range("F3").value
    Else
        ' Tru?ng h?p d? phòng n?u không tìm th?y, dành di?n vào H3 (ít khi x?y ra)
        ws_PNK.Range("H3").value = ws_Nhap.Range("F3").value
    End If
    
    ' 3. X? lý "Lý do nh?p" (L?y t? ô H3 - áp d?ng cách n?i duôi tuong t? d? tránh l?i font)
    Set rngFound = ws_PNK.Range("A1:L10").Find("Lý do nh?p", LookIn:=xlValues, LookAt:=xlPart)
    
    If Not rngFound Is Nothing Then
        rngFound.value = rngFound.value & " " & ws_Nhap.Range("H3").value
    Else
        ws_PNK.Range("B7").value = ws_Nhap.Range("H3").value
    End If

    ' Ch?nh chi?u cao dòng tiêu d?
    ws_PNK.Rows("1:1").RowHeight = 60

    ' Xác d?nh dòng cu?i c?a Header
    lastRow_PNK = ws_PNK.Cells(ws_PNK.Rows.count, "B").End(xlUp).Row

    ' --- 4. Ð? d? li?u chi ti?t ---
    If lastRow_Nhap > startRow_Nhap Then
        
        countData = lastRow_Nhap - startRow_Nhap
        
        ' A. Copy Mã Hàng & Tên Hàng
        ws_Nhap.Range("C" & startRow_Nhap + 1 & ":D" & lastRow_Nhap).Copy
        ws_PNK.Range("B" & lastRow_PNK + 1).PasteSpecial xlPasteValues
        
        ' B. Ði?n S? Th? T? (STT)
        With ws_PNK.Range("A" & lastRow_PNK + 1).Resize(countData, 1)
            .Formula = "=ROW() - " & lastRow_PNK
            .value = .value
        End With

        ' C. VLOOKUP Tên Hàng
        With ws_PNK.Range("D" & lastRow_PNK + 1).Resize(countData, 1)
            .Formula = "=VLOOKUP(B" & lastRow_PNK + 1 & ",'" & ws_DMHH.Name & "'!B:F, 3, 0)"
            .value = .value
        End With

        ' D. Copy Ðon v?, S? lu?ng, Thành ti?n
        ws_Nhap.Range("E" & startRow_Nhap + 1 & ":E" & lastRow_Nhap).Copy
        ws_PNK.Range("E" & lastRow_PNK + 1).PasteSpecial xlPasteValues
        
        ws_Nhap.Range("G" & startRow_Nhap + 1 & ":G" & lastRow_Nhap).Copy
        ws_PNK.Range("F" & lastRow_PNK + 1).PasteSpecial xlPasteValues
        
        ws_Nhap.Range("I" & startRow_Nhap + 1 & ":I" & lastRow_Nhap).Copy
        ws_PNK.Range("J" & lastRow_PNK + 1).PasteSpecial xlPasteValues

        Application.CutCopyMode = False

        ' --- 5. K? b?ng & Chân trang ---
        Dim newLastRow As Long
        newLastRow = lastRow_PNK + countData
        
        ' K? khung
        ws_PNK.Range("A8:J" & newLastRow).Borders.LineStyle = xlContinuous
        ws_PNK.Range("A8:J" & newLastRow).Columns.AutoFit
        
        ' Copy Chân trang
        ws_TieuDe.Range("C33:J41").Copy Destination:=ws_PNK.Range("A" & newLastRow + 1)
        
    End If

ErrorHandler:
    ' --- 6. D?n d?p ---
    ActiveSheet.DisplayPageBreaks = PageBreakState
    Application.Calculation = CalcState
    Application.EnableEvents = True
    Application.ScreenUpdating = True
    
    If Err.Number <> 0 Then MsgBox "L?i: " & Err.Description
End Sub


Sub TaoPhieuXuatKho()
If Date > 46421 Then
Exit Sub
End If
Application.ScreenUpdating = False
EventState = Application.EnableEvents
Application.EnableEvents = False
CalcState = Application.Calculation
Application.Calculation = xlCalculationAutomatic
PageBreakState = ActiveSheet.DisplayPageBreaks
ActiveSheet.DisplayPageBreaks = False
On erro GoTo 2

Dim ws_PXK, ws_Xuat, ws_DMHH As Worksheet
Set ws_PXK = ThisWorkbook.Sheets("PXK")
Set ws_DMHH = ThisWorkbook.Sheets("Danh Muc HH")
Set ws_Xuat = ThisWorkbook.Sheets("Xuat")
Dim startRow_Xuat, lastRow_Xuat As Double
Dim startRow_DanhMucHH, lastRow_DanhMucHH As Double
Set ws_TieuDe = ThisWorkbook.Sheets("TieuDe")

startRow_Xuat = 2
lastRow_Xuat = Excel.WorksheetFunction.CountA(ws_Xuat.Range("B:B")) + startRow_Xuat - 2
ws_PXK.Rows("1:1048576").Delete
ws_TieuDe.Range("C43:J53").Copy Destination:=ws_PXK.Range("A1")
ws_Xuat.Range("B3").Copy Destination:=ws_PXK.Range("C2")
ws_TieuDe.Rows("1:1").RowHeight = 60
 

lastRow_PXK = Excel.WorksheetFunction.CountA(ws_PXK.Range("A:A")) + 4
If lastRow_Xuat > startRow_Xuat Then
ws_Xuat.Range("C" & startRow_Xuat + 1 & ":D" & lastRow_Xuat).Copy
ws_PXK.Range("B" & lastRow_PXK + 1).PasteSpecial xlPasteValues
Application.CutCopyMode = False
Dim a As Integer
For a = startRow_Xuat - 1 To lastRow_Xuat - 2
ws_PXK.Range("A" & lastRow_PXK + a) = a
ws_PXK.Range("D" & lastRow_PXK + a) = Excel.WorksheetFunction.VLookup(ws_PXK.Range("B" & lastRow_PXK + a), ws_DMHH.Range("B:F"), 3, 0)
Next a
ws_Xuat.Range("E" & startRow_Xuat + 1 & ":E" & lastRow_Xuat).Copy
ws_PXK.Range("E" & lastRow_PXK + 1).PasteSpecial xlPasteValues
Application.CutCopyMode = False
ws_Xuat.Range("G" & startRow_Xuat + 1 & ":G" & lastRow_Xuat).Copy
ws_PXK.Range("G" & lastRow_PXK + 1).PasteSpecial xlPasteValues
Application.CutCopyMode = False
ws_Xuat.Range("F" & startRow_Xuat + 1 & ":F" & lastRow_Xuat).Copy
ws_PXK.Range("H" & lastRow_PXK + 1).PasteSpecial xlPasteValues
Application.CutCopyMode = False

lastRow_PXK = Excel.WorksheetFunction.CountA(ws_PXK.Range("A:A")) + 4
ws_PXK.Range("A11" & ":H" & lastRow_PXK).Borders.LineStyle = xlContinuous
ws_PXK.Range("A11" & ":H" & lastRow_PXK).Columns.AutoFit
ws_TieuDe.Range("C55:G60").Copy Destination:=ws_PXK.Range("A" & lastRow_PXK + 2)

  End If
2   ActiveSheet.DisplayPageBreaks = PageBreakState
Application.Calculation = CalcState
Application.EnableEvents = EventState
Application.ScreenUpdating = True
End Sub
Sub TaoPhieuChuyenKho()
If Date > 46421 Then
Exit Sub
End If
Application.ScreenUpdating = False
EventState = Application.EnableEvents
Application.EnableEvents = False
CalcState = Application.Calculation
Application.Calculation = xlCalculationAutomatic
PageBreakState = ActiveSheet.DisplayPageBreaks
ActiveSheet.DisplayPageBreaks = False
On erro GoTo 2

Dim ws_PCK, ws_ChuyenKho, ws_DMHH As Worksheet
Set ws_PCK = ThisWorkbook.Sheets("PCK")
Set ws_DMHH = ThisWorkbook.Sheets("Danh Muc HH")
Set ws_ChuyenKho = ThisWorkbook.Sheets("ChuyenKho")
Dim startRow_ChuyenKho, lastRow_ChuyenKho As Double
Dim startRow_DanhMucHH, lastRow_DanhMucHH As Double
Set ws_TieuDe = ThisWorkbook.Sheets("TieuDe")

startRow_ChuyenKho = 2
lastRow_ChuyenKho = Excel.WorksheetFunction.CountA(ws_ChuyenKho.Range("B:B")) + startRow_ChuyenKho - 2
ws_PCK.Rows("1:1048576").Delete
ws_TieuDe.Range("C62:K72").Copy Destination:=ws_PCK.Range("A1")
ws_ChuyenKho.Range("B3").Copy Destination:=ws_PCK.Range("C2")
ws_TieuDe.Rows("1:1").RowHeight = 60
  

lastRow_PXK = Excel.WorksheetFunction.CountA(ws_PCK.Range("A:A")) + 4
If lastRow_ChuyenKho > startRow_ChuyenKho Then
ws_ChuyenKho.Range("C" & startRow_ChuyenKho + 1 & ":D" & lastRow_ChuyenKho).Copy
ws_PCK.Range("B" & lastRow_PXK + 1).PasteSpecial xlPasteValues
Application.CutCopyMode = False
Dim a As Integer
For a = startRow_ChuyenKho - 1 To lastRow_ChuyenKho - 2
ws_PCK.Range("A" & lastRow_PXK + a) = a
ws_PCK.Range("D" & lastRow_PXK + a) = Excel.WorksheetFunction.VLookup(ws_PCK.Range("B" & lastRow_PXK + a), ws_DMHH.Range("B:F"), 3, 0)
Next a
ws_ChuyenKho.Range("E" & startRow_ChuyenKho + 1 & ":H" & lastRow_ChuyenKho).Copy
ws_PCK.Range("E" & lastRow_PXK + 1).PasteSpecial xlPasteValues
Application.CutCopyMode = False

lastRow_PXK = Excel.WorksheetFunction.CountA(ws_PCK.Range("A:A")) + 4
ws_PCK.Range("A11" & ":I" & lastRow_PXK).Borders.LineStyle = xlContinuous
ws_PCK.Range("A11" & ":I" & lastRow_PXK).Columns.AutoFit
ws_TieuDe.Range("C74:I79").Copy Destination:=ws_PCK.Range("A" & lastRow_PXK + 2)

  End If
2   ActiveSheet.DisplayPageBreaks = PageBreakState
Application.Calculation = CalcState
Application.EnableEvents = EventState
Application.ScreenUpdating = True
End Sub
Sub TruTheKho()
  If Date > 46421 Then
Exit Sub
End If
Application.ScreenUpdating = False
EventState = Application.EnableEvents
Application.EnableEvents = False
CalcState = Application.Calculation
Application.Calculation = xlCalculationAutomatic
PageBreakState = ActiveSheet.DisplayPageBreaks
ActiveSheet.DisplayPageBreaks = False

On erro GoTo 2
Dim ws_Phieu_NL, ws_DemKho As Worksheet
Set ws_Phieu_NL = ThisWorkbook.Sheets("Phieu NL")
Set ws_DemKho = ThisWorkbook.Sheets("DemKho")
Dim oldWb As Workbook
Set oldWb = ActiveWorkbook

ws_Phieu_NL.Activate
ws_Phieu_NL.Range("F1") = "SX " & Format(Now(), "DD-MMM-YYYY hh mm ")
Call CopySheetTo
Application.ScreenUpdating = False
EventState = Application.EnableEvents
Application.EnableEvents = False
CalcState = Application.Calculation
Application.Calculation = xlCalculationAutomatic
PageBreakState = ActiveSheet.DisplayPageBreaks
ActiveSheet.DisplayPageBreaks = False

oldWb.Activate
ws_DemKho.Activate
ws_DemKho.Range("F1") = "SX " & Format(Now(), "DD-MMM-YYYY hh mm ")
Dim tenFile, Vitrifile As String
tenFile = ws_DemKho.Range("F1")
Call CopySheetTo
Application.ScreenUpdating = False
EventState = Application.EnableEvents
Application.EnableEvents = False
CalcState = Application.Calculation
Application.Calculation = xlCalculationAutomatic
PageBreakState = ActiveSheet.DisplayPageBreaks
ActiveSheet.DisplayPageBreaks = False
Application.DisplayAlerts = False
ActiveWorkbook.Activate
  
    Sheets("Phieu NL").Select
    ActiveSheet.Shapes.Range(Array("Button 1")).Select
    Selection.Delete
       
Vitrifile = "D:\LuuThaoTac\" & tenFile & ".xlsx"
ActiveWorkbook.SaveAs Filename:=Vitrifile
   
Application.DisplayAlerts = True
ActiveWindow.Close
oldWb.Activate

Dim startRow_DemKho, lastRow_DemKho, ht, lot1, lot2, n, l1, l2 As Double
Dim t, q As Integer
startRow_DemKho = 3
lastRow_DemKho = Excel.WorksheetFunction.CountA(ws_DemKho.Range("B:B"))
  For q = startRow_DemKho To lastRow_DemKho
  ht = ws_DemKho.Range("G" & q).value
  n = Excel.WorksheetFunction.SumIfs(ws_Phieu_NL.Range("E:E"), ws_Phieu_NL.Range("B:B"), ws_DemKho.Range("B" & q))
  lot1 = Excel.WorksheetFunction.SumIfs(ws_Phieu_NL.Range("G:G"), ws_Phieu_NL.Range("B:B"), ws_DemKho.Range("B" & q), ws_Phieu_NL.Range("F:F"), ws_DemKho.Range("E" & q))
  'lot2 = Excel.WorksheetFunction.SumIfs(ws_Phieu_NL.Range("I:I"), ws_Phieu_NL.Range("B:B"), ws_DemKho.Range("B" & q), ws_Phieu_NL.Range("H:H"), ws_DemKho.Range("E" & q))
  If ws_DemKho.Range("I" & q).value = "C" Then
  l1 = Excel.WorksheetFunction.SumIfs(ws_Phieu_NL.Range("G:G"), ws_Phieu_NL.Range("B:B"), ws_DemKho.Range("B" & q))
  'l2 = Excel.WorksheetFunction.SumIfs(ws_Phieu_NL.Range("I:I"), ws_Phieu_NL.Range("B:B"), ws_DemKho.Range("B" & q))
           If l1 > n Then
          lastRow_DemKho = Excel.WorksheetFunction.CountA(ws_DemKho.Range("B:B"))
          ws_DemKho.Range("G" & q) = ht - lot1
          ws_DemKho.Range("B" & lastRow_DemKho + 1) = ws_DemKho.Range("B" & q)
          ws_DemKho.Range("C" & lastRow_DemKho + 1) = ws_DemKho.Range("C" & q)
          ws_DemKho.Range("D" & lastRow_DemKho + 1) = ws_DemKho.Range("D" & q)
          ws_DemKho.Range("E" & lastRow_DemKho + 1) = "SX1"
          ws_DemKho.Range("F" & lastRow_DemKho + 1) = ws_DemKho.Range("F" & q) - 1
          ws_DemKho.Range("G" & lastRow_DemKho + 1) = l1 - n
          End If
   Else
  ws_DemKho.Range("G" & q) = ht - lot1
   End If
  Next q
  
  t = 3
  Do While ws_DemKho.Range("G" & t) <> ""
               If ws_DemKho.Range("G" & t) = 0 Then
               ws_DemKho.Rows(t).Delete
               t = t - 1
               End If
   t = t + 1
   Loop
   
1   Sheets("DemKho").Select
            Range("SoDoKho[#All]").Select
    ActiveWorkbook.Worksheets("DemKho").ListObjects("SoDoKho").Sort.SortFields. _
        Clear
    ActiveWorkbook.Worksheets("DemKho").ListObjects("SoDoKho").Sort.SortFields.Add _
        key:=Range("SoDoKho[Ma HH]"), SortOn:=xlSortOnValues, Order:=xlAscending _
        , DataOption:=xlSortNormal
    ActiveWorkbook.Worksheets("DemKho").ListObjects("SoDoKho").Sort.SortFields.Add _
        key:=Range("SoDoKho[Ngay Nhap]"), SortOn:=xlSortOnValues, Order:= _
        xlAscending, DataOption:=xlSortNormal
    ActiveWorkbook.Worksheets("DemKho").ListObjects("SoDoKho").Sort.SortFields.Add _
        key:=Range("SoDoKho[SL]"), SortOn:=xlSortOnValues, Order:=xlAscending, _
        DataOption:=xlSortNormal
    With ActiveWorkbook.Worksheets("DemKho").ListObjects("SoDoKho").Sort
        .Header = xlYes
        .MatchCase = False
        .Orientation = xlTopToBottom
        .SortMethod = xlPinYin
        .Apply
    End With
    
    ws_Phieu_NL.Rows("5:1048576").Delete
    Call TonKho

2    ActiveSheet.DisplayPageBreaks = PageBreakState
Application.Calculation = CalcState
Application.EnableEvents = EventState
Application.ScreenUpdating = True
End Sub
Sub Copy_DonHang()
    ' --- 1. HIEN CANH BAO TRUOC KHI CHAY CODE ---
    Dim xacNhan As VbMsgBoxResult
    xacNhan = MsgBox("Ban da luu cac don hang cu chua?" & vbCrLf & _
                     "Neu copy du lieu moi, du lieu hien tai o sheet CB_DH se bi xoa." & vbCrLf & _
                     "Chon 'Yes' de tiep tuc, chon 'No' de huy thao tac.", _
                     vbYesNo + vbQuestion + vbDefaultButton2, "Canh bao an toan du lieu")
    
    ' Neu nguoi dung bam No -> Dung code ngay lap tuc
    If xacNhan = vbNo Then
        MsgBox "Da huy thao tac. Ban hay kiem tra va luu lai don hang nhe!", vbInformation, "Huy thao tac"
        Exit Sub
    End If
    ' ---------------------------------------------

    ' --- 2. KHAI BAO BIEN ---
    Dim wbHT As Workbook, wb As Workbook
    Dim ws_CB_DH As Worksheet, ws_Sapo As Worksheet, ws_LuuXuat As Worksheet
    Dim kq_File_duoc_chon As Variant
    Dim dk_Loc_LoaiFile As String, dk_Ten_tieu_de As String
    Dim lastRow_Sapo As Long, lastRow_CB_DH As Long
    Dim i As Long, j As Long, r As Long
    Dim phatHienTrung As Boolean
    Dim demTrung As Integer
    
    '--- Luu trang thai he thong ---
    Application.ScreenUpdating = False
    Application.EnableEvents = False
    Application.Calculation = xlCalculationManual
    
    On Error GoTo ErrorHandler
    
    Set wbHT = ActiveWorkbook
    Set ws_CB_DH = wbHT.Sheets("CB_DH")
    Set ws_LuuXuat = wbHT.Sheets("LuuXuat") ' Khai bao them sheet Luu Xuat de kiem tra
    
    '--- Chon file Sapo ---
    dk_Loc_LoaiFile = "Excel Files (*.xls*),*.xls,CSV Files (*.csv),*.csv"
    dk_Ten_tieu_de = "Chon File danh sach don hang Sapo..."
    
    kq_File_duoc_chon = Application.GetOpenFilename(FileFilter:=dk_Loc_LoaiFile, Title:=dk_Ten_tieu_de)
    
    If kq_File_duoc_chon = False Then
        MsgBox "Ban da huy thao tac hoac khong chon file.", vbInformation
        GoTo ExitSub
    End If
    
    '--- Mo file va xu ly file Sapo ---
    Set wb = Workbooks.Open(kq_File_duoc_chon)
    Set ws_Sapo = wb.Sheets(1)
    
    ' Xoa 17 dong tieu de dau tien
    ws_Sapo.Rows("1:17").Delete Shift:=xlUp
    
    ' Tim dong cuoi cung dua vao cot E
    lastRow_Sapo = ws_Sapo.Cells(ws_Sapo.Rows.count, "E").End(xlUp).Row
    If lastRow_Sapo < 1 Then lastRow_Sapo = 1
    
    '--- Xoa du lieu cu va Copy du lieu sang CB_DH ---
    wbHT.Activate
    ws_CB_DH.Activate
    ws_CB_DH.Rows("2:" & ws_CB_DH.Rows.count).Clear
    
    ws_Sapo.Range("C1:C" & lastRow_Sapo).Copy Destination:=ws_CB_DH.Range("E2")
    ws_Sapo.Range("B1:B" & lastRow_Sapo).Copy Destination:=ws_CB_DH.Range("B2")
    ws_Sapo.Range("D1:E" & lastRow_Sapo).Copy Destination:=ws_CB_DH.Range("C2")
    ws_Sapo.Range("F1:G" & lastRow_Sapo).Copy Destination:=ws_CB_DH.Range("F2")
    
    Application.CutCopyMode = False
    wb.Close SaveChanges:=False
    
    '--- Xu ly tiep tren file hien tai ---
    ws_CB_DH.Cells.ClearFormats
    ws_CB_DH.Range("F1").value = ""
    ws_CB_DH.Range("A2").value = "ID"
    
    ' Tim dong cuoi cua CB_DH dua vao cot C
    lastRow_CB_DH = ws_CB_DH.Cells(ws_CB_DH.Rows.count, "C").End(xlUp).Row
    
    ' Dien du lieu con thieu va tao ID
    For j = 3 To lastRow_CB_DH
        If ws_CB_DH.Range("B" & j).value = "" Then
            ws_CB_DH.Range("B" & j).value = ws_CB_DH.Range("B" & j - 1).value
        End If
        If ws_CB_DH.Range("E" & j).value = "" Then
            ws_CB_DH.Range("E" & j).value = ws_CB_DH.Range("E" & j - 1).value
        End If
        ws_CB_DH.Range("A" & j).value = ws_CB_DH.Range("B" & j).value & "_" & j
    Next j
    
    ' XOA DONG: Bat buoc lap tu duoi len
    For i = lastRow_CB_DH To 3 Step -1
        If ws_CB_DH.Range("G" & i).value = "DLD" Then
            ws_CB_DH.Rows(i).Delete Shift:=xlUp
        End If
    Next i
    
    ' Chinh kich thuoc cot
    ws_CB_DH.Columns("A:F").AutoFit
    
    ' =========================================================================
    ' 3. KIEM TRA DON HANG TRUNG LAP (Chong xuat dup)
    ' =========================================================================
    phatHienTrung = False
    demTrung = 0
    
    ' Cap nhat lai dong cuoi sau khi xoa cac dong "DLD"
    lastRow_CB_DH = ws_CB_DH.Cells(ws_CB_DH.Rows.count, "C").End(xlUp).Row
    
    ws_CB_DH.Range("B3:B" & lastRow_CB_DH).Interior.ColorIndex = xlNone
    
    For r = 3 To lastRow_CB_DH
        If ws_CB_DH.Range("B" & r).value <> "" Then
            ' Dung CountIf doi chieu Ma don hang voi Cot F cua sheet LuuXuat
            If Excel.WorksheetFunction.CountIf(ws_LuuXuat.Range("F:F"), ws_CB_DH.Range("B" & r).value) > 0 Then
                ws_CB_DH.Range("B" & r).Interior.Color = RGB(255, 100, 100)
                phatHienTrung = True
                demTrung = demTrung + 1
            End If
        End If
    Next r
    
    ws_CB_DH.Range("A1").Select
    
    If phatHienTrung = True Then
        Dim xacNhanTrung As VbMsgBoxResult
        xacNhanTrung = MsgBox("CANH BAO: Phat hien " & demTrung & " dong don hang da tung duoc xuat kho (da boi DO o cot B)!" & vbCrLf & _
                              "Ban co chac chan muon giu lai de xu ly tiep cac don nay khong?", _
                              vbYesNo + vbExclamation + vbDefaultButton2, "Canh bao xuat dup")
        
        If xacNhanTrung = vbNo Then
            MsgBox "Da dung thao tac! Vui long kiem tra cac don hang bi boi do va xoa chung truoc khi tao phieu.", vbInformation
            GoTo ExitSub
        End If
    End If
    ' =========================================================================
    
    MsgBox "Xu ly du lieu don hang thanh cong!", vbInformation

    GoTo ExitSub

ErrorHandler:
    MsgBox "Co loi xay ra trong qua trinh chay code: " & Err.Description, vbCritical

ExitSub:
    '--- Khoi phuc trang thai he thong ---
    Application.Calculation = xlCalculationAutomatic
    Application.EnableEvents = True
    Application.ScreenUpdating = True
End Sub

Sub TaoPhieu_DH()
    ' Kiem tra Time Bomb
    If Date > 46421 Then
        Exit Sub
    End If

    Application.ScreenUpdating = False
    EventState = Application.EnableEvents
    Application.EnableEvents = False
    CalcState = Application.Calculation
    Application.Calculation = xlCalculationAutomatic
    PageBreakState = ActiveSheet.DisplayPageBreaks
    ActiveSheet.DisplayPageBreaks = False

    On Error GoTo 6

    Dim ws_Phieu_DH As Worksheet, ws_DanhMucHH As Worksheet, ws_DemKho As Worksheet, ws_CB_DH As Worksheet
    Set ws_CB_DH = ThisWorkbook.Sheets("CB_DH")
    Set ws_Phieu_DH = ThisWorkbook.Sheets("Phieu_DH")
    Set ws_DemKho = ThisWorkbook.Sheets("DemKho")
    Set ws_DanhMucHH = ThisWorkbook.Sheets("Danh Muc HH")

    Dim ws_LuuXuat As Worksheet, ws_LuuChuyenKho As Worksheet, ws_LuuNhap As Worksheet
    Dim ws_DieuChinhKho As Worksheet
    Dim ws_TieuDe As Worksheet
    Dim ws_LuuXuatSXLK As Worksheet, ws_LuuNhapSXTP As Worksheet

    Set ws_LuuXuat = ThisWorkbook.Sheets("LuuXuat")
    Set ws_LuuNhap = ThisWorkbook.Sheets("LuuNhap")
    Set ws_LuuXuatSXLK = ThisWorkbook.Sheets("LuuXuatSXLK")
    Set ws_LuuNhapSXTP = ThisWorkbook.Sheets("LuuNhapSXTP")
    Set ws_LuuChuyenKho = ThisWorkbook.Sheets("LuuChuyenKho")
    Set ws_DieuChinhKho = ThisWorkbook.Sheets("DieuChinhKho")
    Set ws_TieuDe = ThisWorkbook.Sheets("TieuDe")

    Dim lastRow_CB_DH As Double, lastRow_Phieu_DH As Double
    
    ' Kiem tra du lieu dau vao
    lastRow_CB_DH = Excel.WorksheetFunction.CountA(ws_CB_DH.Range("B:B"))
    If lastRow_CB_DH < 3 Then GoTo 6

    ' =========================================================
    ' Xoa mau nen cu (Reset) tu cot B den G cua sheet CB_DH de chuan bi quet
    ws_CB_DH.Range("B3:G" & lastRow_CB_DH).Interior.ColorIndex = xlNone
    Dim coHangThieu As Boolean
    Dim r1 As Long, r2 As Long
    Dim maDonHang As String
    coHangThieu = False
    ' =========================================================

    Dim i As Integer, j As Integer, m As Integer
    
    ' Xoa du lieu cu va copy tieu de (dong 2 va 3)
    ws_Phieu_DH.Rows("2:1048576").Delete
    ws_TieuDe.Range("C1:J2").Copy Destination:=ws_Phieu_DH.Range("B2")

    lastRow_Phieu_DH = Excel.WorksheetFunction.CountA(ws_Phieu_DH.Range("B:B"))
    
    ' -------------------------------------------------------------------------
    ' COPY DU LIEU TU CB_DH SANG PHIEU_DH & CANH BAO MA HANG SAO
    ' -------------------------------------------------------------------------
    j = 4 ' Du lieu bat dau ghi tu dong 4
    
    ' Vong lap duyet qua danh sach don hang (CB_DH)
    lastRow_CB_DH = Excel.WorksheetFunction.CountA(ws_CB_DH.Range("B:B"))
    
    For i = 3 To lastRow_CB_DH Step 1
        ' Kiem tra xem ma hang o CB_DH cot C co trong Danh Muc Hang Hoa cot B khong
        If Excel.WorksheetFunction.CountIfs(ws_DanhMucHH.Range("B:B"), ws_CB_DH.Range("C" & i)) = 0 Then
            ' Neu khong tim thay -> Hien canh bao
            MsgBox "Ma hang nay chua ton tai trong Danh muc Hang hoa: " & ws_CB_DH.Range("C" & i).value & vbNewLine & _
                   "Vui long kiem tra lai dong " & i & " ben sheet CB_DH.", vbCritical, "Loi Ma Hang"
            
            ws_CB_DH.Activate
            ws_CB_DH.Range("C" & i).Select
            GoTo 6
        End If
        
        ' Neu ma hang ton tai thi chay tiep logic cu (Gop ma trung)
        If Excel.WorksheetFunction.CountIfs(ws_Phieu_DH.Range("B:B"), ws_CB_DH.Range("C" & i)) = 0 Then
            ws_Phieu_DH.Range("B" & j) = ws_CB_DH.Range("C" & i)
            ws_Phieu_DH.Range("C" & j) = Excel.WorksheetFunction.VLookup(ws_Phieu_DH.Range("B" & j), ws_DanhMucHH.Range("B:F"), 2, 0)
            ws_Phieu_DH.Range("E" & j) = Excel.WorksheetFunction.SumIfs(ws_CB_DH.Range("F:F"), ws_CB_DH.Range("C:C"), ws_Phieu_DH.Range("B" & j))
            j = j + 1
        End If
        
        lastRow_Phieu_DH = Excel.WorksheetFunction.CountA(ws_Phieu_DH.Range("B:B"))
    Next i
    ' -------------------------------------------------------------------------

    Dim SLDaNhap As Double, SLDaNhapSXTP As Double, TongSLDaNhap As Double, SLDaNhapCK As Double
    Dim SLDaXuat As Double, SLDaXuatSXLK As Double, TongSLDaXuat As Double, SLDaXuatCK As Double
    Dim SLNhap_TK As Double, SLNhapSXTP_TK As Double, TongSLNhap_TK As Double, SLNhapCK_TK As Double
    Dim SLXuat_TK As Double, SLXuatSXTP_TK As Double, TongSLXuat_TK As Double, SLXuatCK_TK As Double, SLXuatSXLK_TK As Double
    Dim SLDauKy As Double, SLKhoCon As Double, SLDieuChinh As Double
    Dim NgayDauThang As Double, NgayCuoiThang As Double
    
    NgayCuoiThang = Excel.WorksheetFunction.EoMonth(Date, 0)
    NgayDauThang = Excel.WorksheetFunction.EoMonth(Date, -1) + 1
    
    Dim TonThucTe As Double, n As Double
    Dim q As Integer

    ' Sap xep sheet DemKho (Code cu)
    Sheets("DemKho").Select
    Range("SoDoKho[#All]").Select
    ActiveWorkbook.Worksheets("DemKho").ListObjects("SoDoKho").Sort.SortFields.Clear
    ActiveWorkbook.Worksheets("DemKho").ListObjects("SoDoKho").Sort.SortFields.Add key:=Range("SoDoKho[Ma HH]"), SortOn:=xlSortOnValues, Order:=xlAscending, DataOption:=xlSortNormal
    ActiveWorkbook.Worksheets("DemKho").ListObjects("SoDoKho").Sort.SortFields.Add key:=Range("SoDoKho[Ngay Nhap]"), SortOn:=xlSortOnValues, Order:=xlAscending, DataOption:=xlSortNormal
    ActiveWorkbook.Worksheets("DemKho").ListObjects("SoDoKho").Sort.SortFields.Add key:=Range("SoDoKho[SL]"), SortOn:=xlSortOnValues, Order:=xlAscending, DataOption:=xlSortNormal
    With ActiveWorkbook.Worksheets("DemKho").ListObjects("SoDoKho").Sort
        .Header = xlYes
        .MatchCase = False
        .Orientation = xlTopToBottom
        .SortMethod = xlPinYin
        .Apply
    End With

    lastRow_Phieu_DH = Excel.WorksheetFunction.CountA(ws_Phieu_DH.Range("B:B"))

    m = 4
    Do While ws_Phieu_DH.Range("B" & m) <> ""
        n = ws_Phieu_DH.Range("E" & m)
        ws_Phieu_DH.Range("C2") = "Kho Chính"
                                                        
        SLDaNhap = Excel.WorksheetFunction.SumIfs(ws_LuuNhap.Range("E:E"), ws_LuuNhap.Range("C:C"), ws_Phieu_DH.Range("B" & m), ws_LuuNhap.Range("G:G"), ws_Phieu_DH.Range("C2"), ws_LuuNhap.Range("B:B"), "<" & NgayDauThang)
        SLDaNhapCK = Excel.WorksheetFunction.SumIfs(ws_LuuChuyenKho.Range("E:E"), ws_LuuChuyenKho.Range("C:C"), ws_Phieu_DH.Range("B" & m), ws_LuuChuyenKho.Range("G:G"), ws_Phieu_DH.Range("C2"), ws_LuuChuyenKho.Range("B:B"), "<" & NgayDauThang)
        SLDaNhapSXTP = Excel.WorksheetFunction.SumIfs(ws_LuuNhapSXTP.Range("E:E"), ws_LuuNhapSXTP.Range("C:C"), ws_Phieu_DH.Range("B" & m), ws_LuuNhapSXTP.Range("F:F"), ws_Phieu_DH.Range("C2"), ws_LuuNhapSXTP.Range("B:B"), "<" & NgayDauThang)
        TongSLDaNhap = SLDaNhap + SLDaNhapCK + SLDaNhapSXTP

        SLDaXuat = Excel.WorksheetFunction.SumIfs(ws_LuuXuat.Range("E:E"), ws_LuuXuat.Range("C:C"), ws_Phieu_DH.Range("B" & m), ws_LuuXuat.Range("G:G"), ws_Phieu_DH.Range("C2"), ws_LuuXuat.Range("B:B"), "<" & NgayDauThang)
        SLDaXuatCK = Excel.WorksheetFunction.SumIfs(ws_LuuChuyenKho.Range("E:E"), ws_LuuChuyenKho.Range("C:C"), ws_Phieu_DH.Range("B" & m), ws_LuuChuyenKho.Range("F:F"), ws_Phieu_DH.Range("C2"), ws_LuuChuyenKho.Range("B:B"), "<" & NgayDauThang)
        SLDaXuatSXLK = Excel.WorksheetFunction.SumIfs(ws_LuuXuatSXLK.Range("E:E"), ws_LuuXuatSXLK.Range("C:C"), ws_Phieu_DH.Range("B" & m), ws_LuuXuatSXLK.Range("F:F"), ws_Phieu_DH.Range("C2"), ws_LuuXuatSXLK.Range("B:B"), "<" & NgayDauThang)
        TongSLDaXuat = SLDaXuat + SLDaXuatCK + SLDaXuatSXLK

        SLDieuChinh = Excel.WorksheetFunction.SumIfs(ws_DieuChinhKho.Range("E:E"), ws_DieuChinhKho.Range("C:C"), ws_Phieu_DH.Range("B" & m), ws_DieuChinhKho.Range("G:G"), ws_Phieu_DH.Range("C2"))

        SLDauKy = TongSLDaNhap - TongSLDaXuat + SLDieuChinh

        SLNhap_TK = Excel.WorksheetFunction.SumIfs(ws_LuuNhap.Range("E:E"), ws_LuuNhap.Range("C:C"), ws_Phieu_DH.Range("B" & m), ws_LuuNhap.Range("G:G"), ws_Phieu_DH.Range("C2"), ws_LuuNhap.Range("B:B"), ">=" & NgayDauThang, ws_LuuNhap.Range("B:B"), "<=" & NgayCuoiThang)
        SLNhapCK_TK = Excel.WorksheetFunction.SumIfs(ws_LuuChuyenKho.Range("E:E"), ws_LuuChuyenKho.Range("C:C"), ws_Phieu_DH.Range("B" & m), ws_LuuChuyenKho.Range("G:G"), ws_Phieu_DH.Range("C2"), ws_LuuChuyenKho.Range("B:B"), ">=" & NgayDauThang, ws_LuuChuyenKho.Range("B:B"), "<=" & NgayCuoiThang)
        SLNhapSXTP_TK = Excel.WorksheetFunction.SumIfs(ws_LuuNhapSXTP.Range("E:E"), ws_LuuNhapSXTP.Range("C:C"), ws_Phieu_DH.Range("B" & m), ws_LuuNhapSXTP.Range("F:F"), ws_Phieu_DH.Range("C2"), ws_LuuNhapSXTP.Range("B:B"), ">=" & NgayDauThang, ws_LuuNhapSXTP.Range("B:B"), "<=" & NgayCuoiThang)
        TongSLNhap_TK = SLNhap_TK + SLNhapCK_TK + SLNhapSXTP_TK

        SLXuat_TK = Excel.WorksheetFunction.SumIfs(ws_LuuXuat.Range("E:E"), ws_LuuXuat.Range("C:C"), ws_Phieu_DH.Range("B" & m), ws_LuuXuat.Range("G:G"), ws_Phieu_DH.Range("C2"), ws_LuuXuat.Range("B:B"), ">=" & NgayDauThang, ws_LuuXuat.Range("B:B"), "<=" & NgayCuoiThang)
        SLXuatCK_TK = Excel.WorksheetFunction.SumIfs(ws_LuuChuyenKho.Range("E:E"), ws_LuuChuyenKho.Range("C:C"), ws_Phieu_DH.Range("B" & m), ws_LuuChuyenKho.Range("F:F"), ws_Phieu_DH.Range("C2"), ws_LuuChuyenKho.Range("B:B"), ">=" & NgayDauThang, ws_LuuChuyenKho.Range("B:B"), "<=" & NgayCuoiThang)
        SLXuatSXLK_TK = Excel.WorksheetFunction.SumIfs(ws_LuuXuatSXLK.Range("E:E"), ws_LuuXuatSXLK.Range("C:C"), ws_Phieu_DH.Range("B" & m), ws_LuuXuatSXLK.Range("F:F"), ws_Phieu_DH.Range("C2"), ws_LuuXuatSXLK.Range("B:B"), ">=" & NgayDauThang, ws_LuuXuatSXLK.Range("B:B"), "<=" & NgayCuoiThang)
        TongSLXuat_TK = SLXuat_TK + SLXuatCK_TK + SLXuatSXLK_TK

        SLKhoCon = SLDauKy + TongSLNhap_TK - TongSLXuat_TK
        TonThucTe = Excel.WorksheetFunction.SumIfs(ws_DemKho.Range("G:G"), ws_DemKho.Range("B:B"), ws_Phieu_DH.Range("B" & m))

        ' =========================================================
        ' KIEM TRA VA BOI MAU O CA 2 SHEET KHI THIEU TON KHO
        If TonThucTe < n Then
            coHangThieu = True
            
            ' 1. Boi DO toan bo dong cua ma hang thieu do ben sheet Phieu_DH (Tu cot B den I)
            ws_Phieu_DH.Range("B" & m & ":I" & m).Interior.Color = RGB(255, 100, 100)
            
            ' 2. Tim don hang chua ma thieu va boi VANG CAM ca don do ben sheet CB_DH
            For r1 = 3 To lastRow_CB_DH
                If ws_CB_DH.Range("C" & r1).value = ws_Phieu_DH.Range("B" & m).value Then
                    maDonHang = ws_CB_DH.Range("B" & r1).value
                    For r2 = 3 To lastRow_CB_DH
                        If ws_CB_DH.Range("B" & r2).value = maDonHang Then
                            ws_CB_DH.Range("B" & r2 & ":G" & r2).Interior.Color = RGB(226, 165, 30)
                        End If
                    Next r2
                End If
            Next r1
        End If
        ' =========================================================

        Dim startRow_DemKho As Double, lastRow_DemKho As Double
        startRow_DemKho = 3
        lastRow_DemKho = Excel.WorksheetFunction.CountA(ws_DemKho.Range("B:B"))
        
        For q = startRow_DemKho To lastRow_DemKho
2           If ws_DemKho.Range("B" & q).value = ws_Phieu_DH.Range("B" & m) Then
                If 0 < ws_DemKho.Range("G" & q).value And ws_DemKho.Range("G" & q).value < n Then
                    ws_Phieu_DH.Range("F" & m) = ws_DemKho.Range("E" & q)
                    ws_Phieu_DH.Range("G" & m) = ws_DemKho.Range("G" & q).value
                    ws_Phieu_DH.Range("D" & m) = SLKhoCon - ws_Phieu_DH.Range("G" & m)
                    ws_Phieu_DH.Range("H" & m) = TonThucTe - ws_Phieu_DH.Range("G" & m)
                    ws_Phieu_DH.Range("B" & m & ":I" & m).Copy
                    ws_Phieu_DH.Range("B" & m & ":I" & m).Insert Shift:=xlDown
                    Application.CutCopyMode = False
                    SLKhoCon = SLKhoCon - ws_Phieu_DH.Range("G" & m)
                    TonThucTe = TonThucTe - ws_Phieu_DH.Range("G" & m)
                    n = n - ws_Phieu_DH.Range("G" & m)
                    m = m + 1
                    q = q + 1
                    GoTo 2
                Else
                    If ws_DemKho.Range("G" & q).value >= n Then
                        ws_Phieu_DH.Range("F" & m) = ws_DemKho.Range("E" & q)
                        ws_Phieu_DH.Range("G" & m) = n
                        ws_Phieu_DH.Range("D" & m) = SLKhoCon - n
                        ws_Phieu_DH.Range("H" & m) = TonThucTe - n
                    Else
                        GoTo 31
                    End If
                End If
                GoTo 3
            End If
31      Next q
3       m = m + 1
    Loop

    ' =========================================================
    ' TINH TOAN LAI TON THUC TE TAI VI TRI SAU KHI LAY (GHI DE COT H)
    ' VA KE BANG KENG, SAP XEP THU TU A-Z COT F
    ' =========================================================
    lastRow_Phieu_DH = Excel.WorksheetFunction.CountA(ws_Phieu_DH.Range("B:B"))
    
    If lastRow_Phieu_DH >= 4 Then
        Dim r3 As Long
        Dim slTonKhoViTri As Double
        Dim slDaLay As Double
        
        ' LUU Y: Vong lap nay phai chay tu dong 4 tro di (Dong 3 la tieu de)
        For r3 = 4 To lastRow_Phieu_DH
            If ws_Phieu_DH.Range("B" & r3).value <> "" Then
                ' 1. Tinh tong ton ban dau cua Ma san pham do TAI VI TRI do
                slTonKhoViTri = Excel.WorksheetFunction.SumIfs(ws_DemKho.Range("G:G"), ws_DemKho.Range("B:B"), ws_Phieu_DH.Range("B" & r3), ws_DemKho.Range("E:E"), ws_Phieu_DH.Range("F" & r3))
                
                ' 2. Tinh tong so luong DA LAY (cong don tu tren xuong)
                slDaLay = Excel.WorksheetFunction.SumIfs(ws_Phieu_DH.Range("G4:G" & r3), ws_Phieu_DH.Range("B4:B" & r3), ws_Phieu_DH.Range("B" & r3), ws_Phieu_DH.Range("F4:F" & r3), ws_Phieu_DH.Range("F" & r3))
                
                ' 3. Ghi lai ket qua chuan xac vao Cot H (Ton thuc te sau lay)
                ws_Phieu_DH.Range("H" & r3).value = slTonKhoViTri - slDaLay
                
                ' 4. Xoa rong cot I de tra lai cho Ghi chu
                ws_Phieu_DH.Range("I" & r3).value = ""
            End If
        Next r3
        
        ' Ke bang xuyen suot tu B den I (Bao gom ca tieu de dong 3)
        ws_Phieu_DH.Range("B3:I" & lastRow_Phieu_DH).Borders.LineStyle = xlContinuous
    End If

    ' Sap xep chuan A-Z cho cot F (Header = xlYes, bat dau tu B3 de giu nguyen Tieu de dong 3)
    ActiveWorkbook.Worksheets("Phieu_DH").Sort.SortFields.Clear
    ActiveWorkbook.Worksheets("Phieu_DH").Sort.SortFields.Add key:=ws_Phieu_DH.Range("F4:F" & lastRow_Phieu_DH), SortOn:=xlSortOnValues, Order:=xlAscending, DataOption:=xlSortNormal
    With ActiveWorkbook.Worksheets("Phieu_DH").Sort
        .SetRange ws_Phieu_DH.Range("B3:K" & lastRow_Phieu_DH)
        .Header = xlYes
        .MatchCase = False
        .Orientation = xlTopToBottom
        .SortMethod = xlPinYin
        .Apply
    End With

    ' =========================================================
    ' CHAN TAO PHIEU NEU CO HANG THIEU (Da tinh toan va ke bang xong het roi)
    If coHangThieu = True Then
        MsgBox "CANH BAO: Phat hien co ma hang khong du ton kho de xuat!" & vbCrLf & _
               "Toan bo cac don hang bi anh huong da duoc boi mau VANG CAM (sheet CB_DH)." & vbCrLf & _
               "Ma hang bi het cung da duoc boi DO nguyen dong ben (sheet Phieu_DH)." & vbCrLf & _
               "Vui long sang sheet CB_DH de xoa cac don hang nay roi bam TAO PHIEU lai nhe.", vbCritical, "Thieu Ton Kho"
        ws_CB_DH.Activate
        GoTo 6 ' Nhay thang xuong Exit, khong tao Footer QR hay luu lich su
    End If
    ' =========================================================

    ThisWorkbook.Sheets("Phieu_DH").Activate

    ws_Phieu_DH.Range("B" & lastRow_Phieu_DH + 1) = Sheets("TieuDe").Range("C4")
    ws_Phieu_DH.Range("D" & lastRow_Phieu_DH + 1) = Sheets("TieuDe").Range("D4")
    Call RemoveQR
    ws_Phieu_DH.Range("D2") = "Ma Lenh Xuat"
    ws_Phieu_DH.Range("E2") = "XLKDH" & Format(Now(), "DDMMYY hh:mm")
    ws_Phieu_DH.Range("E2").Select
    Call AddQR
    ws_Phieu_DH.Range("F2").Select
    Selection.RowHeight = 80
    Range("B2:F2").Select
    With Selection
        .HorizontalAlignment = xlCenter
        .VerticalAlignment = xlCenter
    End With
    With Selection.Font
        .Name = "Times New Roman"
        .FontStyle = "Bold"
        .Size = 14
    End With
    Columns("B:I").EntireColumn.AutoFit

    Dim lastRow_DonXuatLKSX, g, cc As Integer
    Dim ws_DonXuatLKSX As Worksheet
    Set ws_DonXuatLKSX = ThisWorkbook.Sheets("DonXuatLKSX")
    lastRow_DonXuatLKSX = Excel.WorksheetFunction.CountA(ws_DonXuatLKSX.Range("B:B"))
    cc = lastRow_DonXuatLKSX + 1

    For g = 4 To lastRow_Phieu_DH
        ws_DonXuatLKSX.Range("B" & cc) = ws_Phieu_DH.Range("E2")
        ws_DonXuatLKSX.Range("C" & cc) = ws_Phieu_DH.Range("B" & g)
        ws_DonXuatLKSX.Range("D" & cc) = ws_Phieu_DH.Range("G" & g)
        ws_DonXuatLKSX.Range("E" & cc) = ws_Phieu_DH.Range("F" & g)
        ws_DonXuatLKSX.Range("A" & cc) = ws_DonXuatLKSX.Range("B" & cc) & "_" & cc
        cc = cc + 1
    Next g

6   ' Nhan thoat
    ActiveSheet.DisplayPageBreaks = PageBreakState
    Application.Calculation = CalcState
    Application.EnableEvents = EventState
    Application.ScreenUpdating = True
End Sub
Sub TruVaoSoDoKho()
If Date > 46421 Then
Exit Sub
End If
Application.ScreenUpdating = False
EventState = Application.EnableEvents
Application.EnableEvents = False
CalcState = Application.Calculation
Application.Calculation = xlCalculationAutomatic
PageBreakState = ActiveSheet.DisplayPageBreaks
ActiveSheet.DisplayPageBreaks = False

On erro GoTo 2
Dim ws_DemKho As Worksheet
Set ws_DemKho = ThisWorkbook.Sheets("DemKho")
Dim ws_Phieu_DH As Worksheet
Set ws_Phieu_DH = ThisWorkbook.Sheets("Phieu_DH")
Dim ws_CB_DH As Worksheet
Set ws_CB_DH = ThisWorkbook.Sheets("CB_DH")

Dim oldWb As Workbook
Set oldWb = ActiveWorkbook
ws_Phieu_DH.Activate
ws_Phieu_DH.Range("F1") = "DH " & Format(Now(), "DD-MMM-YYYY hh mm ")
Call CopySheetTo
Application.ScreenUpdating = False
EventState = Application.EnableEvents
Application.EnableEvents = False
CalcState = Application.Calculation
Application.Calculation = xlCalculationAutomatic
PageBreakState = ActiveSheet.DisplayPageBreaks
ActiveSheet.DisplayPageBreaks = False

oldWb.Activate
ws_DemKho.Activate
ws_DemKho.Range("F1") = "DH " & Format(Now(), "DD-MMM-YYYY hh mm ")
Call CopySheetTo
Application.ScreenUpdating = False
EventState = Application.EnableEvents
Application.EnableEvents = False
CalcState = Application.Calculation
Application.Calculation = xlCalculationAutomatic
PageBreakState = ActiveSheet.DisplayPageBreaks
ActiveSheet.DisplayPageBreaks = False
oldWb.Activate

ws_CB_DH.Activate
ws_CB_DH.Range("F1") = "DH " & Format(Now(), "DD-MMM-YYYY hh mm ")
Dim tenFile, Vitrifile As String
tenFile = ws_CB_DH.Range("F1")
Call CopySheetTo
Application.ScreenUpdating = False
EventState = Application.EnableEvents
Application.EnableEvents = False
CalcState = Application.Calculation
Application.Calculation = xlCalculationAutomatic
PageBreakState = ActiveSheet.DisplayPageBreaks
ActiveSheet.DisplayPageBreaks = False
Application.DisplayAlerts = False
ActiveWorkbook.Activate
    
    Sheets("CB_DH").Select
    ActiveSheet.Shapes.Range(Array("Button 2")).Select
    Selection.Delete
    ActiveSheet.Shapes.Range(Array("Button 1")).Select
    Selection.Delete
    ActiveSheet.Shapes.Range(Array("Button 3")).Select
    Selection.Delete
    Sheets("Phieu_DH").Select
    ActiveSheet.Shapes.Range(Array("Button 1")).Select
    Selection.Delete
    
Vitrifile = "D:\LuuThaoTac\" & tenFile & ".xlsx"
ActiveWorkbook.SaveAs Filename:=Vitrifile
   
Application.DisplayAlerts = True
ActiveWindow.Close
oldWb.Activate


Dim startRow_DemKho, lastRow_DemKho, ht, lot1, lot2, n, l1, l2 As Double
Dim t, q As Integer
startRow_DemKho = 3
lastRow_DemKho = Excel.WorksheetFunction.CountA(ws_DemKho.Range("B:B"))
  For q = startRow_DemKho To lastRow_DemKho
  ht = ws_DemKho.Range("G" & q).value
  n = Excel.WorksheetFunction.SumIfs(ws_Phieu_DH.Range("E:E"), ws_Phieu_DH.Range("B:B"), ws_DemKho.Range("B" & q))
  lot1 = Excel.WorksheetFunction.SumIfs(ws_Phieu_DH.Range("G:G"), ws_Phieu_DH.Range("B:B"), ws_DemKho.Range("B" & q), ws_Phieu_DH.Range("F:F"), ws_DemKho.Range("E" & q))
  'lot2 = Excel.WorksheetFunction.SumIfs(ws_Phieu_DH.Range("I:I"), ws_Phieu_DH.Range("B:B"), ws_DemKho.Range("B" & q), ws_Phieu_DH.Range("H:H"), ws_DemKho.Range("E" & q))
  
  If ws_DemKho.Range("I" & q).value = "C" Then
  l1 = Excel.WorksheetFunction.SumIfs(ws_Phieu_DH.Range("G:G"), ws_Phieu_DH.Range("B:B"), ws_DemKho.Range("B" & q))
  'l2 = Excel.WorksheetFunction.SumIfs(ws_Phieu_DH.Range("I:I"), ws_Phieu_DH.Range("B:B"), ws_DemKho.Range("B" & q))
          If l1 + l2 >= n Then
          lastRow_DemKho = Excel.WorksheetFunction.CountA(ws_DemKho.Range("B:B"))
          ws_DemKho.Range("G" & q) = ht - lot1
          ws_DemKho.Range("B" & lastRow_DemKho + 1) = ws_DemKho.Range("B" & q)
          ws_DemKho.Range("C" & lastRow_DemKho + 1) = ws_DemKho.Range("C" & q)
          ws_DemKho.Range("D" & lastRow_DemKho + 1) = ws_DemKho.Range("D" & q)
          ws_DemKho.Range("E" & lastRow_DemKho + 1) = "SX1"
          ws_DemKho.Range("F" & lastRow_DemKho + 1) = ws_DemKho.Range("F" & q) - 1
          ws_DemKho.Range("G" & lastRow_DemKho + 1) = l1 - n
          End If
   Else
  ws_DemKho.Range("G" & q) = ht - lot1
   End If
  Next q
  
  
  
   t = 3
  Do While ws_DemKho.Range("G" & t) <> ""
               If ws_DemKho.Range("G" & t) = 0 Then
               ws_DemKho.Rows(t).Delete
               t = t - 1
               End If
   t = t + 1
   Loop
 
  
  
   
1  Sheets("DemKho").Select
            Range("SoDoKho[#All]").Select
    ActiveWorkbook.Worksheets("DemKho").ListObjects("SoDoKho").Sort.SortFields. _
        Clear
    ActiveWorkbook.Worksheets("DemKho").ListObjects("SoDoKho").Sort.SortFields.Add _
        key:=Range("SoDoKho[Ma HH]"), SortOn:=xlSortOnValues, Order:=xlAscending _
        , DataOption:=xlSortNormal
    ActiveWorkbook.Worksheets("DemKho").ListObjects("SoDoKho").Sort.SortFields.Add _
        key:=Range("SoDoKho[Ngay Nhap]"), SortOn:=xlSortOnValues, Order:= _
        xlAscending, DataOption:=xlSortNormal
    ActiveWorkbook.Worksheets("DemKho").ListObjects("SoDoKho").Sort.SortFields.Add _
        key:=Range("SoDoKho[SL]"), SortOn:=xlSortOnValues, Order:=xlAscending, _
        DataOption:=xlSortNormal
    With ActiveWorkbook.Worksheets("DemKho").ListObjects("SoDoKho").Sort
        .Header = xlYes
        .MatchCase = False
        .Orientation = xlTopToBottom
        .SortMethod = xlPinYin
        .Apply
    End With
    ws_Phieu_DH.Rows("2:1048576").Delete
Call TonKho
2   ActiveSheet.DisplayPageBreaks = PageBreakState
Application.Calculation = CalcState
Application.EnableEvents = EventState
Application.ScreenUpdating = True
End Sub

Sub Vao_BanCuoiNgay()
If Date > 46421 Then
Exit Sub
End If
Application.ScreenUpdating = False
EventState = Application.EnableEvents
Application.EnableEvents = False
CalcState = Application.Calculation
Application.Calculation = xlCalculationAutomatic
PageBreakState = ActiveSheet.DisplayPageBreaks
ActiveSheet.DisplayPageBreaks = False

On erro GoTo 3

Dim ws_Xuat, ws_DanhMucHH, ws_CB_DH As Worksheet
Set ws_CB_DH = ThisWorkbook.Sheets("CB_DH")
Set ws_Xuat = ThisWorkbook.Sheets("Xuat")
Set ws_DanhMucHH = ThisWorkbook.Sheets("Danh Muc HH")

Dim startRow_DanhMucHH, lastRow_DanhMucHH As Double

Dim lastRow_CB_DH, lastRow_Xuat As Double
Dim mahang As String

lastRow_CB_DH = Excel.WorksheetFunction.CountA(ws_CB_DH.Range("B:B"))
If lastRow_CB_DH < 3 Then GoTo 3
lastRow_Xuat = Excel.WorksheetFunction.CountA(ws_Xuat.Range("C:C")) + 1
ws_Xuat.Rows(lastRow_Xuat + 1 & ":" & lastRow_Xuat + 3000).EntireRow.Delete
lastRow_Xuat = Excel.WorksheetFunction.CountA(ws_Xuat.Range("C:C")) + 1

Dim i, j As Integer


lastRow_Xuat = Excel.WorksheetFunction.CountA(ws_Xuat.Range("C:C")) + 1

lastRow_CB_DH = Excel.WorksheetFunction.CountA(ws_CB_DH.Range("B:B"))
 j = lastRow_Xuat + 1
 For i = 3 To lastRow_CB_DH Step 1
    If Excel.WorksheetFunction.CountIfs(ws_DanhMucHH.Range("B:B"), ws_CB_DH.Range("C" & i)) = 0 Then GoTo 1
    ws_Xuat.Range("B" & j) = "=TODAY()"
    ws_Xuat.Range("C" & j) = ws_CB_DH.Range("C" & i)
    ws_Xuat.Range("D" & j) = Excel.WorksheetFunction.VLookup(ws_Xuat.Range("C" & j), ws_DanhMucHH.Range("B:F"), 2, 0)
    ws_Xuat.Range("E" & j) = ws_CB_DH.Range("F" & i)
    ws_Xuat.Range("F" & j) = ws_CB_DH.Range("B" & i)
    ws_Xuat.Range("G" & j) = "Kho Chính"
    ws_Xuat.Range("H" & j) = "Bán ra"
      j = j + 1
1     Next i

           
  ws_Xuat.Range("B:B").NumberFormat = "[$-101042A]d mmmm yyyy;@"
  ThisWorkbook.Sheets("Xuat").Activate
3    Application.Interactive = True
    Application.EnableEvents = True
    Application.ScreenUpdating = True
End Sub

Sub TonKho()

Application.ScreenUpdating = False
EventState = Application.EnableEvents
Application.EnableEvents = False
CalcState = Application.Calculation
Application.Calculation = xlCalculationAutomatic
PageBreakState = ActiveSheet.DisplayPageBreaks
ActiveSheet.DisplayPageBreaks = False


Dim ws_TonKho As Worksheet
Set ws_TonKho = ThisWorkbook.Sheets("TonKho")
ws_TonKho.Cells.Clear

Dim ws_TieuDe As Worksheet
Set ws_TieuDe = ThisWorkbook.Sheets("TieuDe")
ws_TieuDe.Range("A80:G81").Copy Destination:=ws_TonKho.Range("A1")
Application.CutCopyMode = False

Dim ws_LuuXuat, ws_LuuChuyenKho, ws_LuuNhap, ws_DanhMucHH, ws_DieuChinhKho, ws_LyDoXN, ws_DemKho As Worksheet
Set ws_LuuXuat = ThisWorkbook.Sheets("LuuXuat")
Set ws_LuuNhap = ThisWorkbook.Sheets("LuuNhap")
Set ws_DanhMucHH = ThisWorkbook.Sheets("Danh Muc HH")
Set ws_LuuXuatSXLK = ThisWorkbook.Sheets("LuuXuatSXLK")
Set ws_LuuNhapSXTP = ThisWorkbook.Sheets("LuuNhapSXTP")
Set ws_LuuChuyenKho = ThisWorkbook.Sheets("LuuChuyenKho")
Set ws_DieuChinhKho = ThisWorkbook.Sheets("DieuChinhKho")
Set ws_DemKho = ThisWorkbook.Sheets("DemKho")

Dim SLDaNhap, SLDaNhapCK, SLDaNhapSXTP, TongSLDaNhap As Double
Dim SLDaXuat, SLDaXuatCK, SLDaXuatSXLK, TongSLDaXuat As Double
Dim SLKhoCon, SLDieuChinh As Double
Dim n, lastRow_DanhMucHH, lastRow_TonKho As Integer
kho = ws_TonKho.Range("C1").value

lastRow_DanhMucHH = Excel.WorksheetFunction.CountA(ws_DanhMucHH.Range("B:B")) + 1
      For n = 3 To lastRow_DanhMucHH Step 1
        lastRow_TonKho = Excel.WorksheetFunction.CountA(ws_TonKho.Range("A:A"))
        
                SLDaNhap = Excel.WorksheetFunction.SumIfs(ws_LuuNhap.Range("E:E"), ws_LuuNhap.Range("C:C"), ws_DanhMucHH.Range("B" & n), ws_LuuNhap.Range("G:G"), kho)
                SLDaNhapCK = Excel.WorksheetFunction.SumIfs(ws_LuuChuyenKho.Range("E:E"), ws_LuuChuyenKho.Range("C:C"), ws_DanhMucHH.Range("B" & n), ws_LuuChuyenKho.Range("G:G"), kho)
                SLDaNhapSXTP = Excel.WorksheetFunction.SumIfs(ws_LuuNhapSXTP.Range("E:E"), ws_LuuNhapSXTP.Range("C:C"), ws_DanhMucHH.Range("B" & n), ws_LuuNhapSXTP.Range("F:F"), kho)
                TongSLDaNhap = SLDaNhap + SLDaNhapCK + SLDaNhapSXTP
                
                SLDaXuat = Excel.WorksheetFunction.SumIfs(ws_LuuXuat.Range("E:E"), ws_LuuXuat.Range("C:C"), ws_DanhMucHH.Range("B" & n), ws_LuuXuat.Range("G:G"), kho)
                SLDaXuatCK = Excel.WorksheetFunction.SumIfs(ws_LuuChuyenKho.Range("E:E"), ws_LuuChuyenKho.Range("C:C"), ws_DanhMucHH.Range("B" & n), ws_LuuChuyenKho.Range("F:F"), kho)
                SLDaXuatSXLK = Excel.WorksheetFunction.SumIfs(ws_LuuXuatSXLK.Range("E:E"), ws_LuuXuatSXLK.Range("C:C"), ws_DanhMucHH.Range("B" & n), ws_LuuXuatSXLK.Range("F:F"), kho)
                TongSLDaXuat = SLDaXuat + SLDaXuatCK + SLDaXuatSXLK
                
                SLDieuChinh = Excel.WorksheetFunction.SumIfs(ws_DieuChinhKho.Range("E:E"), ws_DieuChinhKho.Range("C:C"), ws_DanhMucHH.Range("B" & n), ws_DieuChinhKho.Range("G:G"), kho)
                
                SLKhoCon = TongSLDaNhap - TongSLDaXuat + SLDieuChinh
                
                   If Excel.WorksheetFunction.Or(SLKhoCon <> 0, TongSLDaXuat <> 0) Then
                       ws_TonKho.Range("A" & lastRow_TonKho + 1) = ws_DanhMucHH.Range("B" & n)
                       ws_TonKho.Range("B" & lastRow_TonKho + 1) = ws_DanhMucHH.Range("C" & n)
                       ws_TonKho.Range("C" & lastRow_TonKho + 1) = TongSLDaNhap
                        ws_TonKho.Range("D" & lastRow_TonKho + 1) = TongSLDaXuat
                        ws_TonKho.Range("E" & lastRow_TonKho + 1) = SLKhoCon
                        
                        ws_TonKho.Range("F" & lastRow_TonKho + 1) = Excel.WorksheetFunction.SumIfs(ws_DemKho.Range("G:G"), ws_DemKho.Range("B:B"), ws_TonKho.Range("A" & lastRow_TonKho + 1))
                        ws_TonKho.Range("G" & lastRow_TonKho + 1) = ws_TonKho.Range("F" & lastRow_TonKho + 1) - ws_TonKho.Range("E" & lastRow_TonKho + 1)
'                        If -0.01 < ws_TonKho.Range("G" & lastRow_TonKho + 1) < 0.01 Then
'                        ws_TonKho.Range("G" & lastRow_TonKho + 1) = 0
'                        End If
                       
                   End If
     Next n
      

lastRow_TonKho = Excel.WorksheetFunction.CountA(ws_TonKho.Range("B:B"))
ws_TonKho.Range("A" & 2 & ":G" & lastRow_TonKho).Borders.LineStyle = xlContinuous
ws_TonKho.Range("A" & 2 & ":G" & lastRow_TonKho).NumberFormat = "_-* #,##0.0_-;-* #,##0.0_-;_-* ""-""??_-;_-@_-"
ws_TonKho.Range("A" & 2 & ":G" & lastRow_TonKho).Columns.AutoFit


 
ActiveSheet.DisplayPageBreaks = PageBreakState
Application.Calculation = CalcState
Application.EnableEvents = EventState
Application.ScreenUpdating = True

ws_TonKho.Activate
ws_TonKho.Range("A1").Select
 End Sub

Sub Form_KiemTra()
If Date > 46421 Then
Exit Sub
End If
'Dim h, c As Integer
'h = Sheet20.Range("C3")
'c = 46
'If Sheet20.Cells(h, c) = "Y" Then
UserFormKiemTra.Show

End Sub

Sub FORM_BaoCaoChiTiet()
If Date > 46421 Then
Exit Sub
End If
UserForm_BaoCaoChiTiet.Show
End Sub

Sub Focus(ByVal Flag As Boolean)
    With Application
        .EnableEvents = Not Flag
        .ScreenUpdating = Not Flag
        .Calculation = IIf(Flag, xlCalculationAutomatic, xlCalculationAutomatic)
    End With
End Sub

Sub AddTho()
    
    For Each cell In Selection
    cell.Offset(0, 1).Select
    filepath = "https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=" & cell.value
    With ActiveSheet.Pictures.Insert(filepath)
    .ShapeRange.ScaleWidth 0.85, msoFalse, msoScaleFromTopLeft
    .ShapeRange.ScaleHeight 0.85, msoFalse, msoScaleFromTopLeft
    End With
    
    Next
    
End Sub
 
 
 Sub RemoveQR()
 For Each pic In ActiveSheet.Pictures
 pic.Delete
 Next pic
 End Sub


Sub AddQR()
    
    For Each cell In Selection
    cell.Offset(0, 1).Select
    filepath = "https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=" & WorksheetFunction.EncodeURL(cell.value)
    With ActiveSheet.Pictures.Insert(filepath)
    .ShapeRange.ScaleWidth 0.85, msoFalse, msoScaleFromTopLeft
    .ShapeRange.ScaleHeight 0.85, msoFalse, msoScaleFromTopLeft
    End With
    
    Next
    
End Sub





