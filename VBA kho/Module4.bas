Attribute VB_Name = "Module4"
Sub AnToanBoSheet()
Dim ws As Worksheet
Dim lr As Long
   lr = 1
  For Each ws In ThisWorkbook.Worksheets
  If ws.Name <> "GiaoDien" Then
  
                If Sheets(ws.Name).Visible = xlSheetVisible Then
                                  Sheets(ws.Name).Visible = xlSheetHidden
                              
                End If
                    lr = lr + 1
            End If
  Next ws

Range("D1").Select
End Sub

Sub HienToanBoSheet()
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


Range("D1").Select
End Sub

Sub CloaseSheetHienTai()
Attribute CloaseSheetHienTai.VB_ProcData.VB_Invoke_Func = "l\n14"
HienTai = ActiveSheet.Name
Dim ws_GiaoDien As Worksheet
Set ws_GiaoDien = ThisWorkbook.Sheets("GiaoDien")
ws_GiaoDien.Activate
ws_GiaoDien.Range("A1").Select
Sheets(HienTai).Visible = xlSheetHidden

End Sub

Sub VesheetGiaoDien()
Attribute VesheetGiaoDien.VB_ProcData.VB_Invoke_Func = "n\n14"
Dim ws_GiaoDien As Worksheet
Set ws_GiaoDien = ThisWorkbook.Sheets("GiaoDien")
ws_GiaoDien.Activate
ws_GiaoDien.Range("A1").Select
End Sub
