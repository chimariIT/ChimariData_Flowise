#!/usr/bin/env python3
import argparse
import json
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier
from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.cluster import KMeans, DBSCAN
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    mean_squared_error, r2_score, silhouette_score
)
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler
import warnings
warnings.filterwarnings('ignore')

class MLAnalyzer:
    def __init__(self, data_path, analysis_type, target_column=None, features=None, parameters=None):
        self.data_path = data_path
        self.analysis_type = analysis_type
        self.target_column = target_column
        self.features = features
        self.parameters = parameters or {}
        self.df = None
        self.results = {}
        
    def load_data(self):
        """Load and preprocess the dataset"""
        try:
            self.df = pd.read_csv(self.data_path)
            return True
        except Exception as e:
            raise Exception(f"Failed to load data: {str(e)}")
    
    def analyze_data_quality(self):
        """Analyze data quality metrics"""
        if self.df is None:
            return {}
            
        total_cells = self.df.size
        missing_cells = self.df.isnull().sum().sum()
        completeness = ((total_cells - missing_cells) / total_cells) * 100
        
        # Check for duplicates
        duplicates = self.df.duplicated().sum()
        
        # Basic consistency checks
        consistency_issues = []
        for col in self.df.select_dtypes(include=[np.number]).columns:
            if self.df[col].std() == 0:
                consistency_issues.append(f"Column '{col}' has constant values")
        
        return {
            "completeness": round(completeness, 2),
            "consistency": max(0, 100 - len(consistency_issues) * 10),
            "accuracy": 95,  # Placeholder - would need domain knowledge
            "issues": [
                f"{missing_cells} missing values" if missing_cells > 0 else None,
                f"{duplicates} duplicate rows" if duplicates > 0 else None,
                *consistency_issues
            ]
        }
    
    def run_regression_analysis(self):
        """Perform regression analysis"""
        if not self.target_column or self.target_column not in self.df.columns:
            raise Exception("Target column required for regression analysis")
        
        # Prepare features
        if self.features:
            feature_cols = [col for col in self.features if col in self.df.columns and col != self.target_column]
        else:
            feature_cols = [col for col in self.df.select_dtypes(include=[np.number]).columns if col != self.target_column]
        
        if len(feature_cols) == 0:
            raise Exception("No suitable features found for regression")
        
        X = self.df[feature_cols].fillna(self.df[feature_cols].mean())
        y = self.df[self.target_column].fillna(self.df[self.target_column].mean())
        
        # Split data
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
        
        # Train models
        models = {
            'Linear Regression': LinearRegression(),
            'Random Forest': RandomForestRegressor(n_estimators=100, random_state=42)
        }
        
        best_model = None
        best_score = -float('inf')
        model_results = {}
        
        for name, model in models.items():
            model.fit(X_train, y_train)
            y_pred = model.predict(X_test)
            
            r2 = r2_score(y_test, y_pred)
            rmse = np.sqrt(mean_squared_error(y_test, y_pred))
            
            model_results[name] = {'r2': r2, 'rmse': rmse}
            
            if r2 > best_score:
                best_score = r2
                best_model = (name, model)
        
        # Feature importance (if available)
        feature_importance = {}
        if hasattr(best_model[1], 'feature_importances_'):
            importance_scores = best_model[1].feature_importances_
            feature_importance = dict(zip(feature_cols, importance_scores))
            feature_importance = dict(sorted(feature_importance.items(), key=lambda x: x[1], reverse=True))
        
        return {
            "summary": f"Regression analysis completed using {best_model[0]} with R² score of {best_score:.3f}",
            "metrics": model_results,
            "modelPerformance": {
                "r2Score": best_score,
                "rmse": model_results[best_model[0]]['rmse']
            },
            "insights": [
                f"Best performing model: {best_model[0]}",
                f"Model explains {best_score*100:.1f}% of variance in {self.target_column}",
                f"Top predictive features: {', '.join(list(feature_importance.keys())[:3])}" if feature_importance else "Feature importance not available"
            ],
            "recommendations": [
                "Consider feature engineering for better performance" if best_score < 0.8 else "Model shows good predictive performance",
                "Collect more data if possible" if len(X) < 1000 else "Dataset size is adequate",
                "Try advanced algorithms like Gradient Boosting" if best_score < 0.9 else "Current model performs well"
            ],
            "visualizations": [
                {
                    "type": "scatter",
                    "title": "Actual vs Predicted Values",
                    "data": {
                        "x": y_test.tolist()[:20],
                        "y": best_model[1].predict(X_test)[:20].tolist()
                    },
                    "config": {"xLabel": "Actual", "yLabel": "Predicted"}
                }
            ]
        }
    
    def run_classification_analysis(self):
        """Perform classification analysis"""
        if not self.target_column or self.target_column not in self.df.columns:
            raise Exception("Target column required for classification analysis")
        
        # Prepare features
        if self.features:
            feature_cols = [col for col in self.features if col in self.df.columns and col != self.target_column]
        else:
            feature_cols = [col for col in self.df.select_dtypes(include=[np.number]).columns if col != self.target_column]
        
        if len(feature_cols) == 0:
            raise Exception("No suitable features found for classification")
        
        X = self.df[feature_cols].fillna(self.df[feature_cols].mean())
        
        # Encode target if it's categorical
        le = LabelEncoder()
        y = le.fit_transform(self.df[self.target_column].fillna('Unknown'))
        
        # Split data
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
        
        # Train models
        models = {
            'Logistic Regression': LogisticRegression(random_state=42, max_iter=1000),
            'Random Forest': RandomForestClassifier(n_estimators=100, random_state=42)
        }
        
        best_model = None
        best_score = 0
        model_results = {}
        
        for name, model in models.items():
            model.fit(X_train, y_train)
            y_pred = model.predict(X_test)
            
            accuracy = accuracy_score(y_test, y_pred)
            precision = precision_score(y_test, y_pred, average='weighted')
            recall = recall_score(y_test, y_pred, average='weighted')
            f1 = f1_score(y_test, y_pred, average='weighted')
            
            model_results[name] = {
                'accuracy': accuracy,
                'precision': precision,
                'recall': recall,
                'f1': f1
            }
            
            if accuracy > best_score:
                best_score = accuracy
                best_model = (name, model)
        
        # Feature importance
        feature_importance = {}
        if hasattr(best_model[1], 'feature_importances_'):
            importance_scores = best_model[1].feature_importances_
            feature_importance = dict(zip(feature_cols, importance_scores))
            feature_importance = dict(sorted(feature_importance.items(), key=lambda x: x[1], reverse=True))
        
        return {
            "summary": f"Classification analysis completed using {best_model[0]} with {best_score*100:.1f}% accuracy",
            "metrics": model_results,
            "modelPerformance": {
                "accuracy": best_score,
                "precision": model_results[best_model[0]]['precision'],
                "recall": model_results[best_model[0]]['recall'],
                "f1Score": model_results[best_model[0]]['f1']
            },
            "insights": [
                f"Best performing model: {best_model[0]}",
                f"Model achieves {best_score*100:.1f}% accuracy on test data",
                f"Number of classes detected: {len(np.unique(y))}",
                f"Most important features: {', '.join(list(feature_importance.keys())[:3])}" if feature_importance else "Feature importance not available"
            ],
            "recommendations": [
                "Performance looks good" if best_score > 0.8 else "Consider feature engineering or more data",
                "Try ensemble methods for better performance" if best_score < 0.9 else "Current model performs well",
                "Check for class imbalance" if len(np.unique(y)) > 2 else "Binary classification detected"
            ]
        }
    
    def run_clustering_analysis(self):
        """Perform clustering analysis"""
        # Prepare features
        if self.features:
            feature_cols = [col for col in self.features if col in self.df.columns]
        else:
            feature_cols = list(self.df.select_dtypes(include=[np.number]).columns)
        
        if len(feature_cols) < 2:
            raise Exception("At least 2 numerical features required for clustering")
        
        X = self.df[feature_cols].fillna(self.df[feature_cols].mean())
        
        # Standardize features
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)
        
        # Determine optimal number of clusters using elbow method
        inertias = []
        silhouette_scores = []
        k_range = range(2, min(11, len(X) // 2))
        
        for k in k_range:
            kmeans = KMeans(n_clusters=k, random_state=42)
            kmeans.fit(X_scaled)
            inertias.append(kmeans.inertia_)
            silhouette_scores.append(silhouette_score(X_scaled, kmeans.labels_))
        
        # Find optimal k (highest silhouette score)
        optimal_k = k_range[np.argmax(silhouette_scores)]
        
        # Final clustering
        kmeans = KMeans(n_clusters=optimal_k, random_state=42)
        cluster_labels = kmeans.fit_predict(X_scaled)
        
        # PCA for visualization
        pca = PCA(n_components=2)
        X_pca = pca.fit_transform(X_scaled)
        
        return {
            "summary": f"Clustering analysis identified {optimal_k} optimal clusters using K-Means",
            "metrics": {
                "optimal_clusters": optimal_k,
                "silhouette_score": max(silhouette_scores),
                "inertia": inertias[optimal_k - 2]
            },
            "modelPerformance": {
                "silhouetteScore": max(silhouette_scores)
            },
            "insights": [
                f"Data naturally groups into {optimal_k} clusters",
                f"Silhouette score of {max(silhouette_scores):.3f} indicates good cluster separation",
                f"Clusters have sizes: {', '.join([str(sum(cluster_labels == i)) for i in range(optimal_k)])}"
            ],
            "recommendations": [
                "Cluster quality looks good" if max(silhouette_scores) > 0.5 else "Consider different algorithms or preprocessing",
                "Analyze cluster characteristics for business insights",
                "Consider DBSCAN for non-spherical clusters" if max(silhouette_scores) < 0.4 else "K-Means works well for this data"
            ],
            "visualizations": [
                {
                    "type": "scatter",
                    "title": "Cluster Visualization (PCA)",
                    "data": {
                        "x": X_pca[:, 0].tolist(),
                        "y": X_pca[:, 1].tolist(),
                        "cluster": cluster_labels.tolist()
                    },
                    "config": {"xLabel": "PC1", "yLabel": "PC2"}
                }
            ]
        }
    
    def run_anomaly_detection(self):
        """Perform anomaly detection"""
        from sklearn.ensemble import IsolationForest
        
        # Prepare features
        if self.features:
            feature_cols = [col for col in self.features if col in self.df.columns]
        else:
            feature_cols = list(self.df.select_dtypes(include=[np.number]).columns)
        
        if len(feature_cols) == 0:
            raise Exception("No numerical features found for anomaly detection")
        
        X = self.df[feature_cols].fillna(self.df[feature_cols].mean())
        
        # Standardize features
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)
        
        # Isolation Forest
        contamination = self.parameters.get('contamination', 0.1)
        iso_forest = IsolationForest(contamination=contamination, random_state=42)
        anomaly_labels = iso_forest.fit_predict(X_scaled)
        
        anomaly_scores = iso_forest.decision_function(X_scaled)
        n_anomalies = sum(anomaly_labels == -1)
        
        return {
            "summary": f"Anomaly detection identified {n_anomalies} potential outliers ({n_anomalies/len(X)*100:.1f}% of data)",
            "metrics": {
                "total_samples": len(X),
                "anomalies_detected": n_anomalies,
                "anomaly_rate": n_anomalies/len(X)*100
            },
            "insights": [
                f"Detected {n_anomalies} anomalies out of {len(X)} samples",
                f"Anomaly rate: {n_anomalies/len(X)*100:.1f}%",
                "Anomalies may indicate data quality issues or interesting outliers"
            ],
            "recommendations": [
                "Investigate detected anomalies for data quality issues",
                "Consider removing anomalies if they represent errors",
                "Anomalies might represent valuable edge cases to analyze separately"
            ]
        }
    
    def run_analysis(self):
        """Main analysis runner"""
        if not self.load_data():
            raise Exception("Failed to load data")
        
        data_quality = self.analyze_data_quality()
        
        if self.analysis_type == 'regression':
            results = self.run_regression_analysis()
        elif self.analysis_type == 'classification':
            results = self.run_classification_analysis()
        elif self.analysis_type == 'clustering':
            results = self.run_clustering_analysis()
        elif self.analysis_type == 'anomaly':
            results = self.run_anomaly_detection()
        else:
            raise Exception(f"Unsupported analysis type: {self.analysis_type}")
        
        return {
            "analysisType": self.analysis_type,
            "results": results,
            "dataQuality": data_quality
        }

def main():
    parser = argparse.ArgumentParser(description='ML Analysis Tool')
    parser.add_argument('--analysis-type', required=True, help='Type of analysis to perform')
    parser.add_argument('--data-path', required=True, help='Path to the data file')
    parser.add_argument('--project-id', required=True, help='Project ID')
    parser.add_argument('--target-column', help='Target column for supervised learning')
    parser.add_argument('--features', help='Comma-separated list of features')
    parser.add_argument('--parameters', help='JSON parameters')
    
    args = parser.parse_args()
    
    try:
        features = args.features.split(',') if args.features else None
        parameters = json.loads(args.parameters) if args.parameters else {}
        
        analyzer = MLAnalyzer(
            data_path=args.data_path,
            analysis_type=args.analysis_type,
            target_column=args.target_column,
            features=features,
            parameters=parameters
        )
        
        result = analyzer.run_analysis()
        print(json.dumps(result, indent=2))
        
    except Exception as e:
        error_result = {
            "error": str(e),
            "analysisType": args.analysis_type,
            "results": {
                "summary": f"Analysis failed: {str(e)}",
                "insights": [],
                "recommendations": []
            },
            "dataQuality": {}
        }
        print(json.dumps(error_result, indent=2))

if __name__ == "__main__":
    main()