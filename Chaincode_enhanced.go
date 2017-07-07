package main

import(
	"fmt"
	"errors"
	"encoding/json"
	"github.com/hyperledger/fabric/core/chaincode/shim"
)

const   PREFIX_PATIENT =  "patient"

type SimpleChaincode struct {
}

type Prescription  struct {
	Disease            	string 		`json:"disease"`
	Medication          string 		`json:"medication"`
	Duration      		string 		`json:"duration"`
}
type Medical_Provider struct{
	Pro_Name       []string    `json:"provider_name"`
}
type Provider struct{
	Provider_Name  		  string     		 `json:"provider_name"`
	Patient_Names     	 []string   	  `json:"patient_names"`
}
type Patient struct {
	Name            	string 			`json:"name"`
	Dob           		string 			`json:"dob"`
	CurrentProblem          string 			`json:"currentproblem"`
	Allergies      		string 			`json:"allergies"`
	Prescriptions 		[]Prescription 	        `json:"prescriptions"`
	Lab_Details             []Lab_Details           `json:"lab_details"`
}
type Lab_Details struct{
	Name_Lab  	  	string  `json:"name_lab"`
	Report_Type 	  	string  `json:"report_type"`
	Date       	   	string  `json:"date"`
	Impressions 		string  `json:"impressions"`
	Findings      	 	string  `json:"findings"`
}

func (t *SimpleChaincode) Init(stub shim.ChaincodeStubInterface, function string, args []string) ([]byte, error) {
	
	if len(args) != 2 {
		return nil,errors.New("Incorrect number of arguments,needed 2")
	}
	err :=stub.PutState(args[0],[]byte(args[1]))
	if err != nil{
		fmt.Errorf(err.Error())
	        return nil,err
	}
	return nil,nil
}
 
func (t *SimpleChaincode) Query(stub shim.ChaincodeStubInterface, function string, args []string) ([]byte, error) {
	if function == "get_patient_details" {
		return t.get_patient_details(stub, args)
	}else if function == "get_patient_provider_mapping" {
		return t.get_patient_provider_mapping(stub,args)
	}

	return nil, errors.New("Received unknown function invocation " + function)

}
 
func (t *SimpleChaincode) Invoke(stub shim.ChaincodeStubInterface, function string, args []string) ([]byte, error) {
	
	if function == "enter_patient_details"{
	return t.enter_patient_details(stub, args)	
	}else if function == "enter_patient_prescription" {    
		return t.enter_patient_prescription(stub, args)
	}else if function == "enter_lab_details" {
		return t.enter_lab_details(stub, args)
	}else if function == "patient_provider_mapping" {
		return t.patient_provider_mapping(stub,args)
	}
	
	return nil, errors.New("Received unknown function invocation " + function)
   
}
 
func main() {
    err := shim.Start(new(SimpleChaincode))
    if err != nil {
        fmt.Println("Could not start SampleChaincode")
    } else {
        fmt.Println("SampleChaincode successfully started")
    }
 
}
func (t *SimpleChaincode) patient_provider_mapping (stub shim.ChaincodeStubInterface, args []string) ([]byte, error) {
// 	if len(args) != 2{
// 		return nil,errors.New("Incorrect number of arguments. Expecting 2")
// 	}
	
	bytes, err := stub.GetState(args[0])
	if err != nil{
	err = stub.PutState(args[0], []byte(args[1]))
		if err != nil { 
		return nil, errors.New("Error storing Provider record") 
	}
	
	}else {
	
		var provider Provider
//  	patient_name := Patient_name{}
// 	patient_name.Pat_Name =args[1]
	provider.Provider_Name=args[0]
	err = json.Unmarshal(bytes,&provider)
		provider.Patient_Names = append(provider.Patient_Names, args[1])
	bytes, err = json.Marshal(&provider)
	if err != nil { 
		return nil, errors.New("Error converting Provider record")
	}
	err = stub.PutState(args[0], bytes)
	if err != nil { 
		return nil, errors.New("Error storing Provider record") 
	}
	}
	return nil, nil
	
}

func (t *SimpleChaincode) get_patient_provider_mapping(stub shim.ChaincodeStubInterface, args []string) ([]byte, error) {

	if len(args) != 1 { 
		return nil, errors.New("Incorrect number of arguments. Expecting 1")
	}

	provider, err := stub.GetState(args[0])
	if err != nil {
		return nil, errors.New("Failed to get state for " + args[0])
	}

	return provider, nil
}
func (t *SimpleChaincode) get_patient_provider_mapping(stub shim.ChaincodeStubInterface, args []string) ([]byte, error) {

	
	
return nil,nil	
}

func (t *SimpleChaincode) enter_patient_details(stub shim.ChaincodeStubInterface, args []string) ([]byte, error) {

	if len(args) != 4 { 
		return nil, errors.New("Incorrect number of arguments. Expecting 4")
	}


	patient := Patient{}
	patient.Name = args[0]
	patient.Dob = args[1]
	patient.CurrentProblem = args[2]
	patient.Allergies =  args[3]
	bytes, err := json.Marshal(&patient)

	if err != nil { 
		return nil, errors.New("Error converting Patient record")
	}

	err = stub.PutState(PREFIX_PATIENT + args[0], bytes)

	if err != nil { 
		return nil, errors.New("Error storing Patient record") 
	}

	return nil, nil
}


func (t *SimpleChaincode) get_patient_details(stub shim.ChaincodeStubInterface, args []string) ([]byte, error) {

	if len(args) != 1 { 
		return nil, errors.New("Incorrect number of arguments. Expecting 1")
	}

	patient, err := stub.GetState(PREFIX_PATIENT + args[0])
	if err != nil {
		return nil, errors.New("Failed to get state for " + args[0])
	}

	return patient, nil
}

func (t *SimpleChaincode) enter_lab_details(stub shim.ChaincodeStubInterface, args []string) ([]byte, error) {

	//	    0              1		   2		  3             4            5
  	//	   Name       Name_Lab        Report_Type        Date      Impressions    Findings
	
	bytes, err := stub.GetState(PREFIX_PATIENT + args[0])
	if err != nil { 
		return nil, errors.New("No Patient with name " + args[0])
	}
	
	var patient Patient
	if len(args) == 1 {
	lab_details := Lab_Details{}
	lab_details.Name_Lab = "-"
	lab_details.Report_Type = "-"
	lab_details.Date = "-"
	lab_details.Impressions = "-"
	lab_details.Findings = "-"
		
	
 	err = json.Unmarshal(bytes,&patient)
 	patient.Lab_Details = append(patient.Lab_Details, lab_details)
	}else
	{
        lab_details := Lab_Details{}
	lab_details.Name_Lab = args[1]
	lab_details.Report_Type = args[2]
	lab_details.Date = args[3]
	lab_details.Impressions = args[4]
	lab_details.Findings = args[5]

	
 	err = json.Unmarshal(bytes,&patient)
 	patient.Lab_Details = append(patient.Lab_Details, lab_details)
	}
	
	bytes, err = json.Marshal(&patient)
	if err != nil { 
		return nil, errors.New("Error converting Patient record") 
	}

	err = stub.PutState(PREFIX_PATIENT + args[0], bytes)
	if err != nil { 
		return nil, errors.New("Error storing Patient record") 
	}

	return nil, nil
}
func (t *SimpleChaincode) enter_patient_prescription(stub shim.ChaincodeStubInterface, args []string) ([]byte, error) {

	//		0		 1		   2		  3
	//	   Name   Disease  Medication  Duration

	if len(args) != 4 { 
		return nil, errors.New("Incorrect number of arguments. Expecting 4")
	}

	bytes, err := stub.GetState(PREFIX_PATIENT + args[0])
	if err != nil { 
		return nil, errors.New("No Patient with name " + args[0])
	}

        
	prescription := Prescription{}
	prescription.Disease = args[1]
	prescription.Medication = args[2]
	prescription.Duration = args[3]

	var patient Patient
 	err = json.Unmarshal(bytes,&patient)
 	patient.Prescriptions = append(patient.Prescriptions, prescription)

	bytes, err = json.Marshal(&patient)
	if err != nil { 
		return nil, errors.New("Error converting Patient record") 
	}

	err = stub.PutState(PREFIX_PATIENT + args[0], bytes)
	if err != nil { 
		return nil, errors.New("Error storing Patient record") 
	}

	return nil, nil
}
