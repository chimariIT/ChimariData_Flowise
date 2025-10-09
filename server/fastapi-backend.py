#!/usr/bin/env python3
import os
import sys
import uvicorn
from fastapi import FastAPI, UploadFile, Form, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
import pandas as pd
import io
import json
import uuid
import hashlib

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Simple in-memory storage for demo
projects_db = {}
users_db = {}
tokens_db = {}

class ProjectUpload(BaseModel):
    name: str
    questions: Optional[List[str]] = []

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def generate_token() -> str:
    return str(uuid.uuid4())

def get_current_user(authorization: str = None):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")
    
    token = authorization.replace("Bearer ", "")
    if token not in tokens_db:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    return tokens_db[token]

@app.post("/upload_project")
async def upload_project(
    file: UploadFile,
    name: str = Form(...),
    questions: Optional[str] = Form(None),
    authorization: str = Depends(lambda r: r.headers.get("authorization"))
):
    user = get_current_user(authorization)
    
    try:
        # Read file content
        content = await file.read()
        
        # Parse based on file type
        if file.filename.endswith(".csv"):
            df = pd.read_csv(io.StringIO(content.decode("utf-8")))
        elif file.filename.endswith(".json"):
            df = pd.read_json(io.BytesIO(content))
        elif file.filename.endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(content))
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type")
    
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"File processing error: {str(e)}")
    
    # Generate schema
    schema_dict = {}
    for col, dtype in df.dtypes.items():
        if pd.api.types.is_integer_dtype(dtype):
            schema_dict[col] = "integer"
        elif pd.api.types.is_float_dtype(dtype):
            schema_dict[col] = "float"
        elif pd.api.types.is_datetime64_any_dtype(dtype):
            schema_dict[col] = "datetime"
        else:
            schema_dict[col] = "string"
    
    # Parse questions
    question_list = []
    if questions:
        try:
            question_list = json.loads(questions)
        except:
            question_list = [q.strip() for q in questions.split('\n') if q.strip()]
    
    # Generate placeholder insights
    insights = {}
    for question in question_list:
        if "top" in question.lower() or "best" in question.lower():
            insights[question] = f"Based on the data analysis, the top performers show significant impact on key metrics. This insight is generated from {len(df)} records."
        elif "trend" in question.lower() or "pattern" in question.lower():
            insights[question] = f"Analysis reveals clear trends over time with notable patterns in the data. Dataset contains {len(df)} records across {len(df.columns)} dimensions."
        elif "customer" in question.lower() or "segment" in question.lower():
            insights[question] = f"Customer segmentation analysis shows distinct behavioral patterns with varying engagement levels across different groups."
        else:
            insights[question] = f"Analysis of this business question reveals important insights from the dataset. Key findings are based on {len(df)} data points."
    
    # Create project with data snapshot for AI analysis
    project_id = str(uuid.uuid4())
    sample_data = df.head(10).to_dict(orient="records")  # Store more sample data for AI
    
    project = {
        "id": project_id,
        "name": name,
        "schema": schema_dict,
        "questions": question_list,
        "insights": insights,
        "created_at": datetime.utcnow().isoformat(),
        "owner_id": user["user_id"],
        "record_count": len(df),
        "status": "active",
        "data_snapshot": sample_data
    }
    
    projects_db[project_id] = project
    
    return {
        "project_id": project_id,
        "preview": df.head(5).to_dict(orient="records"),
        "schema": schema_dict,
        "record_count": len(df)
    }

@app.get("/projects")
def list_projects(authorization: str = Depends(lambda r: r.headers.get("authorization"))):
    user = get_current_user(authorization)
    user_projects = [p for p in projects_db.values() if p["owner_id"] == user["user_id"]]
    return {"projects": user_projects}

@app.get("/projects/{project_id}")
def get_project(project_id: str, authorization: str = Depends(lambda r: r.headers.get("authorization"))):
    user = get_current_user(authorization)
    project = projects_db.get(project_id)
    
    if not project or project["owner_id"] != user["user_id"]:
        raise HTTPException(status_code=404, detail="Project not found")
    
    return project

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
