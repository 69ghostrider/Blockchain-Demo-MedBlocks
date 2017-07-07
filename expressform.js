var express = require('express');
var path = require('path');
var app = express();


app.use(express.static('public'));

app.get('/index.html', function (req, res) {
   res.sendFile( __dirname + "/" + "index.html" );
});


//var calldatfile = require('./helloblockchain.js');

app.get('/process_get', function (req, res) {
   // Prepare output in JSON format
   response = {
      patient_name:req.query.name,
      patient_dob:req.query.dob,
      problem_desc:req.query.probdesc,
      patient_allergy:req.query.allergies,
   };
   module.exports = response;
   //res.send(response);
   var calldatfile = require('./helloblockchain.js');

   // var r = calldatfile.invokeOnUser(response);
   res.redirect('lab_details.html');
  
   //console.log(response);
   res.end(JSON.stringify(response));
})




// app.get('/prescription_details', function (req, res) {

//     // Prepare output in JSON format


//     pres_response = {
//         name: req.query.name,

//         disease: req.query.disease,

//         medication: req.query.medication,

//         duration: req.query.duration,

//     };
//     //write a function and pass response
//      module.exports = pres_response;
//       //res.send(pres_response);
//     var calldatfile = require('./helloblockchain.js');
    
//     res.redirect('lab_details.html');
//     //res.redirect('/nodetobc');

//     res.end(JSON.stringify(pres_response));

// });


// app.get('/lab_det', function (req, res) {

//     // Prepare output in JSON format
//     lab_response = {
//         name: req.query.u_name,

//         lab_name: req.query.lab_name,

//         report_type: req.query.report_type,

//         date: req.query.r_date,

//         impression: req.query.impression,

//         findings: req.query.findings

//     };

//     //write a function and pass response
//     module.exports = lab_response;
//     //res.send(lab_response);
    
//     //res.redirect('/nodetobc');
//     var calldatfile = require('./helloblockchain.js');

//     res.end(JSON.stringify(lab_response));

// });



var server = app.listen(8081, function () {
   var host = server.address().address;
   var port = server.address().port;
   console.log("Example app listening at http://%s:%s", host, port);

})