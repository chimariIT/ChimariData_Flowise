"""
Analysis Module - Clustering Analysis

Standardized output format for Chimaridata pipeline.

Performs:
- K-Means clustering
- Hierarchical clustering
- DBSCAN clustering
- Cluster validation metrics
- Cluster visualization

Standard output format:
{
    "success": true|false,
    "analysisType": "clustering",
    "data": {
        "summary": {...},
        "statistics": {...},
        "visualizations": [...],
        "model": {...}
    },
    "metadata": {
        "recordCount": 100,
        "columnCount": 5,
        "processingTimeMs": 1234
    },
    "errors": []
}
"""

import json
import sys
import time
import logging
from typing import Dict, List, Any

import pandas as pd
import numpy as np
from scipy import stats
from sklearn.cluster import KMeans, AgglomerativeClustering, DBSCAN
from sklearn.metrics import (
    silhouette_score, calinski_harabasz_score,
    davies_bouldin_score
)
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ============================================================================
# Data Classes for Standardized Output
# ============================================================================

class AnalysisResult:
    """Standard analysis result format"""
    success: bool
    analysis_type: str
    data: Dict[str, Any]
    metadata: Dict[str, Any]
    errors: List[str]

    def to_json(self) -> str:
        return json.dumps({
            "success": self.success,
            "analysis_type": self.analysis_type,
            "data": self.data,
            "metadata": self.metadata,
            "errors": self.errors
        }, indent=2)


# ============================================================================
# Main Analysis Function
# ============================================================================

def main():
    """
    Main entry point for clustering analysis

    Reads configuration from stdin and outputs results to stdout
    """
    start_time = time.time()

    try:
        # Parse input configuration
        input_config = json.loads(sys.stdin.read())
        logger.info(f"Received config: {input_config}")

        # Validate required fields
        if "data" not in input_config:
            raise ValueError("Missing required fields: data, project_id")

        data = input_config["data"]
        project_id = input_config.get("project_id", "unknown")
        columns_to_exclude = input_config.get("pii_columns_to_exclude", [])
        question_mappings = input_config.get("question_mappings", [])
        clustering_method = input_config.get("method", "kmeans")
        n_clusters = input_config.get("n_clusters", 3)

        # Load dataframe
        df = pd.DataFrame(data)

        # Exclude PII columns
        if columns_to_exclude:
            df = df.drop(columns=columns_to_exclude, errors='ignore')
            logger.info(f"Excluded PII columns: {columns_to_exclude}")

        # Get column types
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()

        logger.info(f"Numeric columns: {len(numeric_cols)}")

        # Build results
        result_data = {
            "summary": {
                "recordCount": int(len(df)),
                "columnCount": int(len(df.columns)),
                "numericColumns": numeric_cols,
                "categoricalColumns": [],
                "missingValues": df.isnull().sum().to_dict(),
                "project_id": project_id,
                "method": clustering_method,
                "nClusters": n_clusters
            },
            "statistics": {},
            "visualizations": [],
            "model": {}
        }

        # Check if we have enough numeric columns
        if len(numeric_cols) == 0:
            result_data["statistics"]["error"] = "No numeric columns found for clustering"
            result = AnalysisResult(
                success=False,
                analysis_type="clustering",
                data=result_data,
                metadata={},
                errors=["No numeric columns found for clustering"]
            )
            print(result.to_json())
            sys.exit(1)

        # Prepare data for clustering
        # Handle missing values
        df_clean = df[numeric_cols].fillna(df[numeric_cols].mean())

        # Standardize features
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(df_clean)

        logger.info(f"Data prepared: {len(df_clean)} rows, {len(df_clean.columns)} columns")

        # Determine clustering method
        if clustering_method == "kmeans":
            logger.info("Using K-Means clustering")
            model = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
            labels = model.fit_predict(X_scaled)

            # Get cluster centers
            cluster_centers = scaler.inverse_transform(model.cluster_centers_)

            # Model statistics
            inertia = model.inertia_
            result_data["model"] = {
                "method": "K-Means",
                "nClusters": n_clusters,
                "inertia": float(inertia),
                "clusterCenters": cluster_centers.tolist()
            }

        elif clustering_method == "hierarchical":
            logger.info("Using hierarchical clustering")
            model = AgglomerativeClustering(n_clusters=n_clusters, linkage='ward')
            labels = model.fit_predict(X_scaled)

            result_data["model"] = {
                "method": "Hierarchical",
                "nClusters": n_clusters,
                "linkage": "ward"
            }

        elif clustering_method == "dbscan":
            logger.info("Using DBSCAN clustering")
            model = DBSCAN(eps=0.5, min_samples=5)
            labels = model.fit_predict(X_scaled)
            n_clusters_found = len(set(labels[labels != -1]))

            result_data["model"] = {
                "method": "DBSCAN",
                "nClusters": n_clusters_found,
                "eps": 0.5,
                "minSamples": 5
            }

            # Update n_clusters for DBSCAN
            n_clusters = n_clusters_found

        else:
            # Default to K-Means
            logger.info(f"Unknown method '{clustering_method}', using K-Means")
            model = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
            labels = model.fit_predict(X_scaled)

            cluster_centers = scaler.inverse_transform(model.cluster_centers_)
            inertia = model.inertia_

            result_data["model"] = {
                "method": "K-Means",
                "nClusters": n_clusters,
                "inertia": float(inertia),
                "clusterCenters": cluster_centers.tolist()
            }

        # Add cluster labels to dataframe
        df_with_clusters = df_clean.copy()
        df_with_clusters['cluster'] = labels

        # Calculate cluster statistics
        cluster_stats = {}
        for i in range(n_clusters):
            cluster_mask = labels == i
            cluster_data = df_clean[cluster_mask]

            if len(cluster_data) > 0:
                cluster_stats[f"cluster_{i}"] = {
                    "count": int(len(cluster_data)),
                    "size": float(len(cluster_data)) / len(df_clean),
                    "mean": cluster_data.mean().to_dict(),
                    "std": cluster_data.std().to_dict(),
                    "min": cluster_data.min().to_dict(),
                    "max": cluster_data.max().to_dict()
                }

        result_data["statistics"]["clusters"] = cluster_stats

        # Calculate validation metrics
        if n_clusters > 1 and n_clusters < len(X_scaled):
            # Silhouette score (measures how similar points are to their own cluster)
            silhouette_avg = silhouette_score(X_scaled, labels)

            # Only calculate other scores if n_clusters matches the model's cluster count
            if len(set(labels)) == n_clusters:
                try:
                    calinski_score = calinski_harabasz_score(X_scaled, labels, n_clusters)
                    davies_score = davies_bouldin_score(X_scaled, labels, n_clusters)
                except Exception as e:
                    calinski_score = 0.0
                    davies_score = 0.0

                result_data["statistics"]["validation"] = {
                    "silhouetteScore": float(silhouette_avg),
                    "calinskiHarabaszScore": float(calinski_score),
                    "daviesBouldinScore": float(davies_score)
                }
            else:
                result_data["statistics"]["validation"] = {
                    "silhouetteScore": float(silhouette_avg),
                    "note": "DBSCAN doesn't match n_clusters"
                }

        # Generate cluster profiles
        cluster_profiles = []
        for i in range(n_clusters):
            cluster_mask = labels == i
            cluster_data = df_clean[cluster_mask]

            if len(cluster_data) > 0:
                profile = {
                    "clusterId": i,
                    "size": int(len(cluster_data)),
                    "profile": {}
                }

                # Profile each column
                for col in numeric_cols:
                    if col in cluster_data.columns:
                        profile["profile"][col] = {
                            "mean": float(cluster_data[col].mean()),
                            "median": float(cluster_data[col].median()),
                            "std": float(cluster_data[col].std()),
                            "min": float(cluster_data[col].min()),
                            "max": float(cluster_data[col].max()),
                            "q25": float(cluster_data[col].quantile(0.25)),
                            "q50": float(cluster_data[col].quantile(0.50)),
                            "q75": float(cluster_data[col].quantile(0.75))
                        }

                cluster_profiles.append(profile)

        result_data["statistics"]["clusterProfiles"] = cluster_profiles

        # Generate visualization configs
        # 2D scatter plot with PCA
        if len(numeric_cols) >= 2:
            pca = PCA(n_components=2)
            X_pca = pca.fit_transform(X_scaled)

            result_data["visualizations"].append({
                "type": "scatter",
                "column": "pca_projection",
                "config": {
                    "title": f"Cluster Analysis (PCA Projection)",
                    "xAxis": "PC1",
                    "yAxis": "PC2",
                    "data": [
                        {"pc1": float(row[0]), "pc2": float(row[1]), "cluster": int(label)}
                        for row, label in zip(X_pca, labels)
                    ]
                }
            })

        # Cluster size bar chart
        cluster_sizes = [len(df_clean[labels == i]) for i in range(n_clusters)]
        result_data["visualizations"].append({
            "type": "bar",
            "column": "cluster",
            "config": {
                "title": "Cluster Sizes",
                "xAxis": "Cluster",
                "yAxis": "Count",
                "data": [
                    {"cluster": i, "count": cluster_sizes[i]}
                    for i in range(n_clusters)
                ]
            }
        })

        # Feature importance by cluster
        if hasattr(model, 'cluster_centers_'):
            centers = scaler.inverse_transform(model.cluster_centers_)
            for i, center in enumerate(centers):
                # Find which features are most important for distinguishing this cluster
                center_df = pd.DataFrame([center], columns=numeric_cols)
                distances = []
                for col in numeric_cols:
                    feature_imp = abs(center[col]) / X_clean[col].std()
                    distances.append({
                        "feature": col,
                        "importance": float(feature_imp)
                    })

                distances.sort(key=lambda x: x["importance"], reverse=True)

                result_data["statistics"][f"cluster_{i}_topFeatures"] = distances[:5]

        # Metadata
        processing_time_ms = int((time.time() - start_time) * 1000)
        result_data["metadata"] = {
            "recordCount": int(len(df_clean)),
            "columnCount": int(len(df_clean.columns)),
            "processingTimeMs": processing_time_ms,
            "project_id": project_id,
            "nClusters": n_clusters,
            "method": clustering_method,
            "excludedColumns": columns_to_exclude
        }

        # Build result
        result = AnalysisResult(
            success=True,
            analysis_type="clustering",
            data=result_data,
            metadata=result_data["metadata"],
            errors=[]
        )

        # Output JSON result
        print(result.to_json())
        logger.info(f"Clustering analysis completed in {processing_time_ms}ms")

    except ValueError as e:
        # Input validation error
        result = AnalysisResult(
            success=False,
            analysis_type="clustering",
            data={},
            metadata={},
            errors=[f"Input validation error: {str(e)}"]
        )
        print(result.to_json())
        logger.error(f"Input validation error: {e}")
        sys.exit(1)

    except Exception as e:
        # Analysis error
        logger.error(f"Analysis error: {str(e)}", exc_info=True)
        result = AnalysisResult(
            success=False,
            analysis_type="clustering",
            data={},
            metadata={"errorTime": time.time()},
            errors=[f"Analysis failed: {str(e)}"]
        )
        print(result.to_json())
        sys.exit(1)


if __name__ == "__main__":
    main()
