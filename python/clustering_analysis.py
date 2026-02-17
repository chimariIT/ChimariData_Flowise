#!/usr/bin/env python3
"""
Clustering Analysis Script
Uses scikit-learn for unsupervised clustering analysis
"""

import json
import sys
import pandas as pd
import numpy as np
from sklearn.cluster import KMeans, DBSCAN, AgglomerativeClustering
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import silhouette_score, calinski_harabasz_score, davies_bouldin_score
from sklearn.decomposition import PCA
import warnings
warnings.filterwarnings('ignore')


def perform_clustering_analysis(config):
    """Perform comprehensive clustering analysis"""
    try:
        # Load data
        data_path = config['data_path']
        data = pd.read_json(data_path)

        n_clusters = config.get('n_clusters', 3)
        method = config.get('method', 'kmeans')

        # Phase 4C-2: Accept explicit feature columns from AnalysisDataPreparer
        features = config.get('features')
        if features:
            available = [f for f in features if f in data.columns]
            if available:
                numeric_data = data[available].select_dtypes(include=[np.number])
            else:
                numeric_data = data.select_dtypes(include=[np.number])
        else:
            # Select only numeric columns (original behavior)
            numeric_data = data.select_dtypes(include=[np.number])

        if numeric_data.shape[1] == 0:
            return {
                'success': False,
                'error': 'No numeric columns found for clustering'
            }

        # Handle missing values
        numeric_data = numeric_data.fillna(numeric_data.mean())

        # Standardize features
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(numeric_data)

        # Perform clustering based on method
        if method == 'kmeans':
            model = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
            labels = model.fit_predict(X_scaled)
            cluster_centers = model.cluster_centers_
            inertia = float(model.inertia_)

        elif method == 'dbscan':
            eps = config.get('eps', 0.5)
            min_samples = config.get('min_samples', 5)
            model = DBSCAN(eps=eps, min_samples=min_samples)
            labels = model.fit_predict(X_scaled)
            cluster_centers = None
            inertia = None
            n_clusters = len(set(labels)) - (1 if -1 in labels else 0)  # Exclude noise points

        elif method == 'hierarchical':
            linkage = config.get('linkage', 'ward')
            model = AgglomerativeClustering(n_clusters=n_clusters, linkage=linkage)
            labels = model.fit_predict(X_scaled)
            cluster_centers = None
            inertia = None

        else:
            # Default to k-means
            model = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
            labels = model.fit_predict(X_scaled)
            cluster_centers = model.cluster_centers_
            inertia = float(model.inertia_)

        # Calculate clustering metrics
        try:
            silhouette = float(silhouette_score(X_scaled, labels))
        except:
            silhouette = None

        try:
            calinski = float(calinski_harabasz_score(X_scaled, labels))
        except:
            calinski = None

        try:
            davies_bouldin = float(davies_bouldin_score(X_scaled, labels))
        except:
            davies_bouldin = None

        # Cluster statistics
        cluster_sizes = pd.Series(labels).value_counts().to_dict()
        cluster_sizes = {int(k): int(v) for k, v in cluster_sizes.items()}

        # Calculate cluster centers in original space (if available)
        if cluster_centers is not None:
            centers_original = scaler.inverse_transform(cluster_centers)
            cluster_centers_dict = {
                int(i): dict(zip(numeric_data.columns, centers_original[i].tolist()))
                for i in range(len(centers_original))
            }
        else:
            # Calculate mean of each cluster
            cluster_centers_dict = {}
            for cluster_id in set(labels):
                if cluster_id != -1:  # Skip noise points in DBSCAN
                    cluster_mask = labels == cluster_id
                    cluster_mean = numeric_data[cluster_mask].mean()
                    cluster_centers_dict[int(cluster_id)] = cluster_mean.to_dict()

        # PCA for visualization (reduce to 2D)
        if X_scaled.shape[1] > 2:
            pca = PCA(n_components=2)
            X_pca = pca.fit_transform(X_scaled)
            explained_variance = pca.explained_variance_ratio_.tolist()
        else:
            X_pca = X_scaled
            explained_variance = None

        # Sample points from each cluster
        cluster_samples = {}
        for cluster_id in set(labels):
            if cluster_id != -1:  # Skip noise points
                cluster_mask = labels == cluster_id
                cluster_indices = np.where(cluster_mask)[0]
                sample_indices = cluster_indices[:min(10, len(cluster_indices))]

                cluster_samples[int(cluster_id)] = [
                    {
                        'index': int(idx),
                        'pca_coordinates': X_pca[idx].tolist() if X_pca is not None else None,
                        'features': data.iloc[idx].to_dict()
                    }
                    for idx in sample_indices
                ]

        # Cluster profiles (feature averages per cluster)
        cluster_profiles = {}
        for cluster_id in set(labels):
            if cluster_id != -1:
                cluster_mask = labels == cluster_id
                cluster_data = numeric_data[cluster_mask]
                cluster_profiles[int(cluster_id)] = {
                    'size': int(cluster_sizes.get(cluster_id, 0)),
                    'feature_means': cluster_data.mean().to_dict(),
                    'feature_stds': cluster_data.std().to_dict()
                }

        # Phase 4C-1: Pass through business context for evidence chain
        result = {
            'success': True,
            'method': method,
            'n_clusters': n_clusters,
            'metrics': {
                'silhouette_score': silhouette,
                'calinski_harabasz_score': calinski,
                'davies_bouldin_score': davies_bouldin,
                'inertia': inertia
            },
            'cluster_sizes': cluster_sizes,
            'cluster_centers': cluster_centers_dict,
            'cluster_profiles': cluster_profiles,
            'cluster_samples': cluster_samples,
            'pca_explained_variance': explained_variance,
            'labels': labels.tolist(),
            'feature_names': numeric_data.columns.tolist()
        }
        business_context = config.get('business_context', {})
        if business_context:
            result['business_context'] = business_context
            result['question_ids'] = business_context.get('question_ids', [])
        return result

    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps({
            'success': False,
            'error': 'Usage: python3 clustering_analysis.py <config_json>'
        }))
        sys.exit(1)

    try:
        config = json.loads(sys.argv[1])
        result = perform_clustering_analysis(config)
        print(json.dumps(result))
        sys.exit(0 if result.get('success') else 1)
    except Exception as e:
        print(json.dumps({
            'success': False,
            'error': f'Configuration error: {str(e)}'
        }))
        sys.exit(1)
