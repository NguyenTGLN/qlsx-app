Attribute VB_Name = "Module5"
Sub TaoBomChiTietAll()
Application.ScreenUpdating = False
EventState = Application.EnableEvents
Application.EnableEvents = False
CalcState = Application.Calculation
Application.Calculation = xlCalculationAutomatic
PageBreakState = ActiveSheet.DisplayPageBreaks
ActiveSheet.DisplayPageBreaks = False
On erro GoTo 3

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
  


Dim ws_DanhMucHH, ws_LuuXuatSXLK, ws_LuuNhapSXTP, ws_ThanhPhamBan, ws_BOMCT As Worksheet
Dim startRow_DanhMucHH, lastRow_DanhMucHH As Double
Set ws_DanhMucHH = ThisWorkbook.Sheets("Danh Muc HH")
Set ws_LuuXuatSXLK = ThisWorkbook.Sheets("LuuXuatSXLK")
Set ws_LuuNhapSXTP = ThisWorkbook.Sheets("LuuNhapSXTP")
Set ws_ThanhPhamBan = ThisWorkbook.Sheets("ThanhPhamBan")
Set ws_BOMCT = ThisWorkbook.Sheets("BOMCT")

Dim DH As Double
Dim ws_KHXuatLK As Worksheet
Set ws_KHXuatLK = ThisWorkbook.Sheets("KHXuatLK")

Dim ws_KHSPNhan As Worksheet
Set ws_KHSPNhan = ThisWorkbook.Sheets("KHSPNhan")

Dim ws_LichSX As Worksheet
Set ws_LichSX = ThisWorkbook.Sheets("LichSX")
Dim ws_Phieu_NL, ws_InBOM, ws_BOM, ws_DMHH As Worksheet
Dim startRow_BOM, lastRow_BOM, startRow_InBOM, lastRow_InBOM As Double
Set ws_Phieu_NL = ThisWorkbook.Sheets("Phieu NL")
Set ws_InBOM = ThisWorkbook.Sheets("InBOM")
Set ws_BOM = ThisWorkbook.Sheets("BOM")
Set ws_DMHH = ThisWorkbook.Sheets("Danh Muc HH")
ws_BOMCT.Range("A2:A100000").EntireRow.Delete


Dim i, sothanhpham, startRow_KHXuatLK, lastRow_KHXuatLK, lastRow_KHSPNhan As Integer
sothanhpham = 2
Do While ws_ThanhPhamBan.Range("A" & sothanhpham) <> ""

startRow_DanhMucHH = 2
lastRow_DanhMucHH = Excel.WorksheetFunction.CountA(ws_DanhMucHH.Range("B:B")) + startRow_DanhMucHH - 2

ws_KHXuatLK.Rows("3:1048576").Delete

ws_LichSX.Rows("3:1048576").Delete

ws_LichSX.Range("C3") = ws_ThanhPhamBan.Range("A" & sothanhpham)
ws_LichSX.Range("B3") = Date
ws_LichSX.Range("E3") = 1
ws_LichSX.Range("F3") = ws_LichSX.Range("F1")

startRow_LichSX = 2
lastRow_LichSX = Excel.WorksheetFunction.CountA(ws_LichSX.Range("B:B"))
ws_Phieu_NL.Rows("5:1048576").Delete

startRow_Phieu_NL = 4
startRow_LichSX = 2
lastRow_LichSX = Excel.WorksheetFunction.CountA(ws_LichSX.Range("B:B"))

lastRow_Phieu_NL = Excel.WorksheetFunction.CountA(ws_Phieu_NL.Range("B:B")) + 1
If lastRow_LichSX > startRow_LichSX Then
ws_LichSX.Range("B" & startRow_LichSX + 1 & ":E" & lastRow_LichSX).Copy
ws_Phieu_NL.Range("B" & lastRow_Phieu_NL + 1).PasteSpecial xlPasteValues
Application.CutCopyMode = False
lastRow_Phieu_NL = Excel.WorksheetFunction.CountA(ws_Phieu_NL.Range("B:B")) + 1
ws_Phieu_NL.Range("B" & 5 & ":B" & lastRow_Phieu_NL).NumberFormat = "[$-101042A]d mmmm yyyy;@"
ws_Phieu_NL.Range("B4" & ":E" & lastRow_Phieu_NL).Borders.LineStyle = xlContinuous

lastRow_Phieu_NL = Excel.WorksheetFunction.CountA(ws_Phieu_NL.Range("B:B")) + 1
Sheets("TieuDe").Range("C6:F7").Copy Destination:=ws_Phieu_NL.Range("B" & lastRow_Phieu_NL + 2)

lastRow_Phieu_NL = Excel.WorksheetFunction.CountA(ws_Phieu_NL.Range("B:B")) + 2
Dim PNL As Double
 PNL = lastRow_Phieu_NL + 1

Dim j, k, h As Integer
For j = startRow_LichSX + 1 To lastRow_LichSX

ws_InBOM.Cells.Clear
Sheets("TieuDe").Range("A90:D94").Copy Destination:=ws_InBOM.Range("A1")

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
    lastRow_Phieu_NL = Excel.WorksheetFunction.CountA(ws_Phieu_NL.Range("B:B")) + 2
    
                For k = startRow_InBOM To lastRow_InBOM Step 1
                 For h = PNL To lastRow_Phieu_NL + 1 Step 1
                     If ws_InBOM.Range("A" & k).value = ws_Phieu_NL.Range("B" & h) Then
                        Dim TamLuu As Double
                        TamLuu = ws_Phieu_NL.Range("E" & h)
                        ws_Phieu_NL.Range("E" & h) = TamLuu + ws_InBOM.Range("D" & k) * ws_LichSX.Range("E" & j)
                        GoTo 1
                       End If
                       Next h


                        ws_InBOM.Range("A" & k & ":D" & k).Copy
                        ws_Phieu_NL.Range("B" & lastRow_Phieu_NL + 1).PasteSpecial xlPasteValues
                        Application.CutCopyMode = False


                        ws_Phieu_NL.Range("E" & lastRow_Phieu_NL + 1) = ws_InBOM.Range("D" & k) * ws_LichSX.Range("E" & j)

             lastRow_Phieu_NL = Excel.WorksheetFunction.CountA(ws_Phieu_NL.Range("B:B")) + 2
1                Next k
        Next j
        
lastRow_Phieu_NL = Excel.WorksheetFunction.CountA(ws_Phieu_NL.Range("B:B")) + 2

ws_Phieu_NL.Range("B" & PNL - 1 & ":E" & lastRow_Phieu_NL).Sort Key1:=ws_Phieu_NL.Range("B" & PNL - 1 & ":B" & lastRow_Phieu_NL), Order1:=xlAscending, Header:=xlYes


lastRow_KHXuatLK = Excel.WorksheetFunction.CountA(ws_KHXuatLK.Range("C:C")) + 1
startRow_KHXuatLK = Excel.WorksheetFunction.CountA(ws_KHXuatLK.Range("B:B"))

ws_Phieu_NL.Range("B" & PNL & ":C" & lastRow_Phieu_NL).Copy
ws_KHXuatLK.Range("C" & lastRow_KHXuatLK + 1).PasteSpecial Paste:=xlPasteValues
        Application.CutCopyMode = False

ws_Phieu_NL.Range("E" & PNL & ":E" & lastRow_Phieu_NL).Copy
ws_KHXuatLK.Range("E" & lastRow_KHXuatLK + 1).PasteSpecial Paste:=xlPasteValues
        Application.CutCopyMode = False

lastRow_KHXuatLK = Excel.WorksheetFunction.CountA(ws_KHXuatLK.Range("C:C")) + 1

ws_Phieu_NL.Range("B5").Copy
ws_KHXuatLK.Range("B" & startRow_KHXuatLK + 1 & ":B" & lastRow_KHXuatLK + 1).PasteSpecial Paste:=xlPasteValues
        Application.CutCopyMode = False

ws_Phieu_NL.Range("D3").Copy
ws_KHXuatLK.Range("F" & startRow_KHXuatLK + 1 & ":F" & lastRow_KHXuatLK + 1).PasteSpecial Paste:=xlPasteValues
        Application.CutCopyMode = False
End If


t = 3
Do Until ws_KHXuatLK.Range("C" & t) = ""
         ws_LichSX.Rows("3:1048576").Delete
          lastRow_KHXuatLK = Excel.WorksheetFunction.CountA(ws_KHXuatLK.Range("C:C")) + 1
          startRow_LichSX = 2
          lastRow_LichSX = Excel.WorksheetFunction.CountA(ws_LichSX.Range("B:B"))
        i = 3
        Do Until ws_KHXuatLK.Range("C" & i) = ""
            If Excel.WorksheetFunction.CountIf(Sheets("BOM").Range("A:A"), ws_KHXuatLK.Range("C" & i)) > 0 Then
            ws_KHXuatLK.Range("B" & i & ":F" & i).Copy
            ws_LichSX.Range("B" & lastRow_LichSX + 1).PasteSpecial Paste:=xlPasteValues, Operation:=xlNone, SkipBlanks _
                    :=False, Transpose:=False
            Application.CutCopyMode = False
            ws_KHXuatLK.Rows(i).EntireRow.Delete
            i = i - 1
            lastRow_LichSX = Excel.WorksheetFunction.CountA(ws_LichSX.Range("B:B"))
            End If
            i = i + 1
        Loop
'Start = lastRow_KHXuatLK + 1
lastRow_KHXuatLK = Excel.WorksheetFunction.CountA(ws_KHXuatLK.Range("C:C")) + 1

With Sheets("Phieu NL")
    If .FilterMode Then .AutoFilterMode = False
End With
ws_Phieu_NL.Rows("5:1048576").Delete

startRow_Phieu_NL = 4
lastRow_LichSX = Excel.WorksheetFunction.CountA(ws_LichSX.Range("B:B"))
lastRow_Phieu_NL = Excel.WorksheetFunction.CountA(ws_Phieu_NL.Range("B:B")) + 1

If lastRow_LichSX > startRow_LichSX Then
ws_LichSX.Range("B" & startRow_LichSX + 1 & ":E" & lastRow_LichSX).Copy
ws_Phieu_NL.Range("B" & lastRow_Phieu_NL).PasteSpecial xlPasteValues
Application.CutCopyMode = False
lastRow_Phieu_NL = Excel.WorksheetFunction.CountA(ws_Phieu_NL.Range("B:B")) + 1
ws_Phieu_NL.Range("B" & startRow_Phieu_NL + 1 & ":B" & lastRow_Phieu_NL).NumberFormat = "[$-101042A]d mmmm yyyy;@"
ws_Phieu_NL.Range("B" & startRow_Phieu_NL & ":E" & lastRow_Phieu_NL).Borders.LineStyle = xlContinuous

lastRow_Phieu_NL = Excel.WorksheetFunction.CountA(ws_Phieu_NL.Range("B:B")) + 1

Sheets("TieuDe").Range("C6:F7").Copy Destination:=ws_Phieu_NL.Range("B" & lastRow_Phieu_NL + 2)

lastRow_Phieu_NL = Excel.WorksheetFunction.CountA(ws_Phieu_NL.Range("B:B")) + 2
 PNL = lastRow_Phieu_NL + 1


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
   lastRow_Phieu_NL = Excel.WorksheetFunction.CountA(ws_Phieu_NL.Range("B:B")) + 2

                        ws_InBOM.Range("A" & k & ":D" & k).Copy
                         ws_Phieu_NL.Range("B" & lastRow_Phieu_NL + 1).PasteSpecial xlPasteValues
                                     Application.CutCopyMode = False


                        ws_Phieu_NL.Range("E" & lastRow_Phieu_NL + 1) = ws_InBOM.Range("D" & k) * ws_LichSX.Range("E" & j)

              lastRow_Phieu_NL = Excel.WorksheetFunction.CountA(ws_Phieu_NL.Range("B:B")) + 2
2             Next k
        Next j
lastRow_Phieu_NL = Excel.WorksheetFunction.CountA(ws_Phieu_NL.Range("B:B")) + 2
ws_Phieu_NL.Range("B" & PNL - 1 & ":E" & lastRow_Phieu_NL + 1).Sort Key1:=ws_Phieu_NL.Range("B" & PNL - 1 & ":B" & lastRow_Phieu_NL + 1), Order1:=xlAscending, Header:=xlYes


lastRow_KHXuatLK = Excel.WorksheetFunction.CountA(ws_KHXuatLK.Range("C:C")) + 1
startRow_KHXuatLK = Excel.WorksheetFunction.CountA(ws_KHXuatLK.Range("B:B"))
ws_Phieu_NL.Range("B" & PNL & ":C" & lastRow_Phieu_NL + 1).Copy
ws_KHXuatLK.Range("C" & lastRow_KHXuatLK + 1).PasteSpecial Paste:=xlPasteValues
        Application.CutCopyMode = False

ws_Phieu_NL.Range("E" & PNL & ":E" & lastRow_Phieu_NL + 1).Copy
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

lastRow_KHXuatLK = Excel.WorksheetFunction.CountA(ws_KHXuatLK.Range("C:C")) + 1
t = t + 1

Loop


ws_InBOM.Rows("6:10000").Delete
ws_InBOM.Range("B4") = ws_ThanhPhamBan.Range("A" & sothanhpham)
ws_InBOM.Range("B3") = Excel.WorksheetFunction.VLookup(ws_InBOM.Range("B4"), ws_DMHH.Range("B:F"), 2, 0)
lastRow_InBOM = Excel.WorksheetFunction.CountA(ws_InBOM.Range("A:A"))
   
lastRow_KHXuatLK = Excel.WorksheetFunction.CountA(ws_KHXuatLK.Range("C:C")) + 1
ws_KHXuatLK.Range("C3" & ":D" & lastRow_KHXuatLK).Copy
ws_InBOM.Range("A6").PasteSpecial xlPasteValues
Application.CutCopyMode = False

ws_KHXuatLK.Range("E3" & ":E" & lastRow_KHXuatLK).Copy
ws_InBOM.Range("D6").PasteSpecial xlPasteValues
lastRow_InBOM = Excel.WorksheetFunction.CountA(ws_InBOM.Range("A:A"))

ws_InBOM.Range("A5:D" & lastRow_InBOM).RemoveDuplicates Columns:=1, Header:=xlYes

lastRow_InBOM = Excel.WorksheetFunction.CountA(ws_InBOM.Range("A:A"))
Dim p As Integer
 For p = 6 To lastRow_InBOM
   ws_InBOM.Range("D" & p) = Excel.WorksheetFunction.SumIfs(ws_KHXuatLK.Range("E:E"), ws_KHXuatLK.Range("C:C"), ws_InBOM.Range("A" & p))
Next p


lastRow_InBOM = Excel.WorksheetFunction.CountA(ws_InBOM.Range("A:A"))
Dim dv As Integer
For dv = 6 To lastRow_InBOM
ws_InBOM.Range("C" & dv) = Excel.WorksheetFunction.VLookup(ws_InBOM.Range("A" & dv), ws_DMHH.Range("B:F"), 3, 0)
Next dv
    ws_InBOM.Range("A5:D" & lastRow_InBOM).Borders.LineStyle = xlContinuous
    
    lastRow_BOMCT = Excel.WorksheetFunction.CountA(ws_BOMCT.Range("B:B"))
    ws_InBOM.Range("A6:D" & lastRow_InBOM).Copy Destination:=ws_BOMCT.Range("B" & lastRow_BOMCT + 1)
    lastRow_BOMCTNEW = Excel.WorksheetFunction.CountA(ws_BOMCT.Range("B:B"))
    ws_InBOM.Range("B4").Copy Destination:=ws_BOMCT.Range("A" & lastRow_BOMCT + 1 & ":A" & lastRow_BOMCTNEW)
    
    sothanhpham = sothanhpham + 1
Loop
  
   lr = 1
  For Each ws In ThisWorkbook.Worksheets
  If ws.Name <> "GiaoDien" Then
  
                If Sheets(ws.Name).Visible = xlSheetVisible Then
                                  Sheets(ws.Name).Visible = xlSheetHidden
                              
                End If
                    lr = lr + 1
            End If
  Next ws

ws_ThanhPhamBan.Visible = xlSheetVisible
ws_BOMCT.Visible = xlSheetVisible

ThisWorkbook.Activate
3
ActiveSheet.DisplayPageBreaks = PageBreakState
Application.Calculation = CalcState
Application.EnableEvents = EventState
Application.ScreenUpdating = True


End Sub


