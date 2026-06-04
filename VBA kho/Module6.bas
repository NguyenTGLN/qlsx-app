Attribute VB_Name = "Module6"
Sub SoSanhDatHang()
Attribute SoSanhDatHang.VB_ProcData.VB_Invoke_Func = " \n14"
Application.ScreenUpdating = False
EventState = Application.EnableEvents
Application.EnableEvents = False
CalcState = Application.Calculation
Application.Calculation = xlCalculationAutomatic
PageBreakState = ActiveSheet.DisplayPageBreaks
ActiveSheet.DisplayPageBreaks = False

On erro GoTo 3

Dim wsDatLK As Worksheet
    Dim wsDatLKTheoBanHang As Worksheet
    Dim wsDatLKDaSoSanh As Worksheet
    Dim lastRowDatLK As Long
    Dim lastRowDatLKTheoBanHang As Long
    Dim i As Long
    Dim j As Long
    Dim foundRow As Long

    ' Thi?t l?p các sheet
    Set wsDatLK = ThisWorkbook.Sheets("DatLK")
    Set wsDatLKTheoBanHang = ThisWorkbook.Sheets("DatLKTheoBanHang")
    Set wsDatLKDaSoSanh = ThisWorkbook.Sheets("DatLKDaSoSanh")

    wsDatLKDaSoSanh.Cells.Clear
    wsDatLK.Cells.Copy wsDatLKDaSoSanh.Range("A1")
    wsDatLKDaSoSanh.Columns("I:J").Insert Shift:=xlToRight
    wsDatLKDaSoSanh.Cells(2, Columns("I").Column).value = "So Ngay Ton Theo phong Sale"
    wsDatLKDaSoSanh.Cells(2, Columns("J").Column).value = "Luong Hang Can Dat Theo phong Sale"

    lastRowDatLK = wsDatLK.Cells(wsDatLK.Rows.count, "B").End(xlUp).Row
    lastRowDatLKDaSoSanh = wsDatLKDaSoSanh.Cells(wsDatLKDaSoSanh.Rows.count, "B").End(xlUp).Row
    lastRowDatLKTheoBanHang = wsDatLKTheoBanHang.Cells(wsDatLKTheoBanHang.Rows.count, "B").End(xlUp).Row

   
    For i = 3 To lastRowDatLKTheoBanHang
       
        foundRow = 0
        For j = 3 To lastRowDatLKDaSoSanh
            If wsDatLKTheoBanHang.Cells(i, "B").value = wsDatLKDaSoSanh.Cells(j, "B").value Then
                foundRow = j
                Exit For
            End If
        Next j

     
        If foundRow > 0 Then
            wsDatLKDaSoSanh.Cells(foundRow, Columns("I").Column).value = wsDatLKTheoBanHang.Cells(i, Columns("G").Column).value
            wsDatLKDaSoSanh.Cells(foundRow, Columns("J").Column).value = wsDatLKTheoBanHang.Cells(i, Columns("H").Column).value
        Else
          
            lastRowDatLKDaSoSanh = lastRowDatLKDaSoSanh + 1
            wsDatLKTheoBanHang.Range("B" & i & ":F" & i).Copy Destination:=wsDatLKDaSoSanh.Range("B" & lastRowDatLKDaSoSanh)
            wsDatLKTheoBanHang.Range("G" & i & ":M" & i).Copy Destination:=wsDatLKDaSoSanh.Range("I" & lastRowDatLKDaSoSanh)
          
        End If
    Next i

lastRowDatLKDaSoSanh = wsDatLKDaSoSanh.Cells(wsDatLKDaSoSanh.Rows.count, "B").End(xlUp).Row
    wsDatLKDaSoSanh.Columns("K:L").Insert Shift:=xlToRight
   wsDatLKDaSoSanh.Cells(2, Columns("K").Column).value = "So Ngay Ton Min Da So Sanh"
   wsDatLKDaSoSanh.Cells(2, Columns("L").Column).value = "Luong Hang Can Dat Da So Sanh"
    wsDatLKDaSoSanh.Cells(2, Columns("M").Column).value = "Luong Hang se dat thuc te"
    
  Dim ma As Long
   For ma = 3 To lastRowDatLKDaSoSanh
      
        If IsNumeric(wsDatLKDaSoSanh.Cells(ma, "H").value) And IsNumeric(wsDatLKDaSoSanh.Cells(ma, "J").value) Then
            wsDatLKDaSoSanh.Cells(ma, "L").value = Application.WorksheetFunction.Max(wsDatLKDaSoSanh.Cells(ma, "H").value, wsDatLKDaSoSanh.Cells(ma, "J").value)
        Else
           
            If IsNumeric(wsDatLKDaSoSanh.Cells(ma, "H").value) Then
                
                 wsDatLKDaSoSanh.Cells(ma, "L").value = wsDatLKDaSoSanh.Cells(ma, "H").value
            ElseIf IsNumeric(wsDatLKDaSoSanh.Cells(ma, "J").value) Then
               
                 wsDatLKDaSoSanh.Cells(ma, "L").value = wsDatLKDaSoSanh.Cells(ma, "J").value
            Else
              
                 wsDatLKDaSoSanh.Cells(ma, "L").value = ""
            End If
        End If
        
        
         If wsDatLKDaSoSanh.Cells(ma, "G") <> "" And wsDatLKDaSoSanh.Cells(ma, "I") <> "" Then
            wsDatLKDaSoSanh.Cells(ma, "K").value = Application.WorksheetFunction.Min(wsDatLKDaSoSanh.Cells(ma, "G").value, wsDatLKDaSoSanh.Cells(ma, "I").value)
        Else
           
            If wsDatLKDaSoSanh.Cells(ma, "I") = "" Then
                
                wsDatLKDaSoSanh.Cells(ma, "K").value = wsDatLKDaSoSanh.Cells(ma, "G").value
                
            ElseIf wsDatLKDaSoSanh.Cells(ma, "G") = "" Then
               
                 wsDatLKDaSoSanh.Cells(ma, "K").value = wsDatLKDaSoSanh.Cells(ma, "I").value
            Else
              
                 wsDatLKDaSoSanh.Cells(ma, "K").value = ""
            End If
        End If
        
        
           wsDatLKDaSoSanh.Cells(ma, "N").value = Date + wsDatLKDaSoSanh.Cells(ma, "K")
           
           If IsNumeric(wsDatLKDaSoSanh.Range("P" & ma)) Then
                                    If wsDatLKDaSoSanh.Cells(ma, "K").value <= wsDatLKDaSoSanh.Range("P" & ma) Then
                                        wsDatLKDaSoSanh.Range("Q" & ma) = "Can Dat Hang Gap"
                                            With wsDatLKDaSoSanh.Range("Q" & ma).Font
                                                 .Color = 255
                                            End With
                                    Else
                                    wsDatLKDaSoSanh.Range("Q" & ma) = ""
                                    End If
                       
                         End If
          
        
    Next ma
   
 wsDatLKDaSoSanh.Range("B" & 2 & ":Q" & lastRowDatLKDaSoSanh).Borders.LineStyle = xlContinuous
 
  wsDatLKDaSoSanh.Activate
 wsDatLKDaSoSanh.Range("F1").Select
 wsDatLKDaSoSanh.Range("F1") = "DatLKDaSoSanh"
 Application.DisplayAlerts = False


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



