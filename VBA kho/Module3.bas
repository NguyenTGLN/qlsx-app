Attribute VB_Name = "Module3"
Sub QRXuat()
Form_CapNhatXuat.Show
End Sub

Sub UploadDonSapoToGoogleSheets()
 Dim ws_CB_DH As Worksheet
Set ws_CB_DH = Sheets("CB_DH")
lastRow_CB_DH = Excel.WorksheetFunction.CountA(ws_CB_DH.Range("B:B"))
ws_CB_DH.Activate

      Dim r As Integer, key As String, url As String
      Dim field1 As String, field2 As String, field3 As String, field4 As String
      Dim HTTPreq As New MSXML2.ServerXMLHTTP60
      'ServerXMLHTTP60
      'ServerXMLHTTP
 
      For r = 3 To lastRow_CB_DH
 
      field1 = Range("A" & r).value
      field2 = Range("B" & r).value
      field3 = Range("E" & r).value
      field4 = Range("C" & r).value
      field5 = Range("F" & r).value
      
      
      
     ' https://docs.google.com/forms/d/e/1FAIpQLSceDKjM50YVhpUfDWpgY0cAQdf_Von3YfUYRL4CbQNgUQag4Q/viewform?usp=pp_url&entry.379095359=madonok&entry.1322270963=996669696969&entry.1048728660=mahangok&entry.1587245084=15
      'https://docs.google.com/forms/u/0/d/e/1FAIpQLSceDKjM50YVhpUfDWpgY0cAQdf_Von3YfUYRL4CbQNgUQag4Q/formResponse
       
      key = "1FAIpQLSceDKjM50YVhpUfDWpgY0cAQdf_Von3YfUYRL4CbQNgUQag4Q"
      url = "https://docs.google.com/forms/u/0/d/e/" & key & _
      "/formResponse?ifq" & _
      "&entry.1935605966=" & field1 & _
      "&entry.379095359=" & field2 & _
      "&entry.1322270963=" & field3 & _
      "&entry.1048728660=" & field4 & _
      "&entry.1587245084=" & field5
 
          
      With HTTPreq
          .Open "POST", url, False
          .setRequestHeader "Content-Type", _
          "application/x-www-form-urlencoded; charset=utf-8"
          .send
      End With
 
      Next r
  End Sub


Sub UploadDonXuatLKSXToGoogleSheets()

Dim lastRow_DonXuatLKSX As Integer
Dim ws_DonXuatLKSX As Worksheet
Set ws_DonXuatLKSX = ThisWorkbook.Sheets("DonXuatLKSX")
lastRow_DonXuatLKSX = Excel.WorksheetFunction.CountA(ws_DonXuatLKSX.Range("B:B"))



      Dim r As Integer, key As String, url As String
      Dim field1 As String, field2 As String, field3 As String, field4 As String
      Dim HTTPreq As New MSXML2.ServerXMLHTTP60
      'ServerXMLHTTP60
      'ServerXMLHTTP
 
      For d = 2 To lastRow_DonXuatLKSX
      If Range("D" & d).value = "" Then
      MsgBox ("Ma Hang:" & Range("C" & d).value & "chua co so luong")
      Range("D" & d).Select
      GoTo 2
      End If
      If Range("E" & d).value = "" Then
      MsgBox ("Ma Hang:" & Range("C" & d).value & "chua co vi tri kho")
      Range("E" & d).Select
      GoTo 2
      End If
      Next d
      
      For r = 2 To lastRow_DonXuatLKSX
      field1 = Range("A" & r).value
      field2 = Range("B" & r).value
      field3 = Range("C" & r).value
      field4 = Range("D" & r).value
      field5 = Range("E" & r).value
      
      
      
      
  'https://docs.google.com/forms/d/e/1FAIpQLSe6HvPKCw60_yQDhVFLvS6nDiNST7_rTqdP5SUAoSq6MzQx6w/viewform?usp=pp_url&entry.2018088790=IDDon&entry.1484996319=MaLenhXuat&entry.1007382943=MaHH&entry.595756486=100&entry.551681246=MaViTriKho
 '.2018088790=IDDon&entry
 '.1484996319=MaLenhXuat&entry
 '.1007382943=MaHH&entry
 '.595756486=100&entry
 '.551681246=MaViTriKho
           
      key = "1FAIpQLSe6HvPKCw60_yQDhVFLvS6nDiNST7_rTqdP5SUAoSq6MzQx6w"
      url = "https://docs.google.com/forms/u/0/d/e/" & key & _
      "/formResponse?ifq" & _
      "&entry.2018088790=" & field1 & _
      "&entry.1484996319=" & field2 & _
      "&entry.1007382943=" & field3 & _
      "&entry.595756486=" & field4 & _
      "&entry.551681246=" & field5
 
          
      With HTTPreq
          .Open "POST", url, False
          .setRequestHeader "Content-Type", _
          "application/x-www-form-urlencoded; charset=utf-8"
          .send
      End With
 
      Next r
    ws_DonXuatLKSX.Activate
    ws_DonXuatLKSX.Range("A2" & ":E" & lastRow_DonXuatLKSX).EntireRow.Delete
      
2  End Sub


Sub DownloadKiemKe()

Dim ws_KiemKeQR As Worksheet
Set ws_KiemKeQR = ActiveWorkbook.Sheets("KiemKeQR")

If ws_KiemKeQR.Visible = xlSheetHidden Then
ws_KiemKeQR.Visible = xlSheetVisible
End If

ws_KiemKeQR.Activate
ws_KiemKeQR.Range("A1").Select

If ActiveSheet.QueryTables.count > 0 Then ActiveSheet.QueryTables(1).Delete
ActiveSheet.Cells.Clear

Dim key As String, url As String
      Dim HTTPreq As Object, HTML As Object
      Dim r As Integer, c As Integer
     
      Set HTTPreq = CreateObject("MSXML2.ServerXMLHTTP")
      key = "16L0-z0AzcoD51ipRTXWTYH6UPnSQ5ZwqQ59c0TJ2P18"
      iGidStrn = "369805453"
      url = "https://spreadsheets.google.com/tq?tqx=out:html&key=" & key & "&gid=" & iGidStrn
      'send HTTP request to get the data
      With HTTPreq
          .Open "GET", url, False
          .send
      End With
      Do Until HTTPreq.readyState = 4: Loop 'waits till request completes
 
      'set HTML variable and assign response
      Set HTML = CreateObject("htmlFile")
      HTML.body.innerHTML = HTTPreq.responseText
 
      'loop through HTML table to get values (add conditions depending on criteria)
      For Each tr In HTML.getElementsByTagName("tr")
              r = r + 1
                  For Each td In tr.getElementsByTagName("td")
                      c = c + 1
                      Cells(r, c).value = td.innerText
                  Next td
                  c = 0
      Next tr

End Sub

Sub DownloadNhapHangQR()

Dim ws_NhapHangQR As Worksheet
Set ws_NhapHangQR = ActiveWorkbook.Sheets("NhapHangQR")
If ws_NhapHangQR.Visible = xlSheetHidden Then
ws_NhapHangQR.Visible = xlSheetVisible
End If

ws_NhapHangQR.Activate
ws_NhapHangQR.Range("A1").Select

If ActiveSheet.QueryTables.count > 0 Then ActiveSheet.QueryTables(1).Delete
ActiveSheet.Cells.Clear

Dim key As String, url As String
      Dim HTTPreq As Object, HTML As Object
      Dim r As Integer, c As Integer
      
      'https://docs.google.com/spreadsheets/d/16L0-z0AzcoD51ipRTXWTYH6UPnSQ5ZwqQ59c0TJ2P18/edit#gid=1188245228
     
      Set HTTPreq = CreateObject("MSXML2.ServerXMLHTTP")
      key = "16L0-z0AzcoD51ipRTXWTYH6UPnSQ5ZwqQ59c0TJ2P18"
      iGidStrn = "1188245228"
      url = "https://spreadsheets.google.com/tq?tqx=out:html&key=" & key & "&gid=" & iGidStrn
      'send HTTP request to get the data
      With HTTPreq
          .Open "GET", url, False
          .send
      End With
      Do Until HTTPreq.readyState = 4: Loop 'waits till request completes
 
      'set HTML variable and assign response
      Set HTML = CreateObject("htmlFile")
      HTML.body.innerHTML = HTTPreq.responseText
 
      'loop through HTML table to get values (add conditions depending on criteria)
      For Each tr In HTML.getElementsByTagName("tr")
              r = r + 1
                  For Each td In tr.getElementsByTagName("td")
                      c = c + 1
                      Cells(r, c).value = td.innerText
                  Next td
                  c = 0
      Next tr

End Sub


Sub DownloadXuatKhacQR()

Dim ws_XuatKhacQR As Worksheet
Set ws_XuatKhacQR = ActiveWorkbook.Sheets("XuatKhacQR")

If ws_XuatKhacQR.Visible = xlSheetHidden Then
ws_XuatKhacQR.Visible = xlSheetVisible
End If

ws_XuatKhacQR.Activate
ws_XuatKhacQR.Range("A1").Select

If ActiveSheet.QueryTables.count > 0 Then ActiveSheet.QueryTables(1).Delete
ActiveSheet.Cells.Clear

Dim key As String, url As String
      Dim HTTPreq As Object, HTML As Object
      Dim r As Integer, c As Integer
      
      'https://docs.google.com/spreadsheets/d/16L0-z0AzcoD51ipRTXWTYH6UPnSQ5ZwqQ59c0TJ2P18/edit#gid=573231438
     
      Set HTTPreq = CreateObject("MSXML2.ServerXMLHTTP")
      key = "16L0-z0AzcoD51ipRTXWTYH6UPnSQ5ZwqQ59c0TJ2P18"
      iGidStrn = "573231438"
      url = "https://spreadsheets.google.com/tq?tqx=out:html&key=" & key & "&gid=" & iGidStrn
      'send HTTP request to get the data
      With HTTPreq
          .Open "GET", url, False
          .send
      End With
      Do Until HTTPreq.readyState = 4: Loop 'waits till request completes
 
      'set HTML variable and assign response
      Set HTML = CreateObject("htmlFile")
      HTML.body.innerHTML = HTTPreq.responseText
 
      'loop through HTML table to get values (add conditions depending on criteria)
      For Each tr In HTML.getElementsByTagName("tr")
              r = r + 1
                  For Each td In tr.getElementsByTagName("td")
                      c = c + 1
                      Cells(r, c).value = td.innerText
                  Next td
                  c = 0
      Next tr

End Sub
