---
title: "Pod 생성 과정 디버깅"
description: "하루에도 수십번 Pod 생성/삭제 요청을 보냅니다. 이 과정을 디버깅하고 운영시 안정성을 높이기 위한 고려해야할 부분들을 정리해봅니다."
date: 2025-02-16
tags:
  - Kubernetes
  - DevOps
---

쿠버네티스 기반으로 서비스를 운영하다보면 하루에도 수십 수백개의 Pod가 새롭게 생성되고 제거되고 합니다. 이 과정이 클라이언트 입장에서는 명령어 한 줄에 너무나 쉽고 당연하게 발생합니다. 하지만 어렴풋이 ‘스케줄링’ 과정을 공부하며 내부적으로는 꽤나 많고 복잡한 과정을 거친다는 것을 알고 있었습니다. 

어렴풋이 알고는 있었지만 이 과정을 명확히 이해하지 못한다면 ‘파드가 생성되지 않는’ 장애가 발생했을 때 단계적으로 파악하지 못해 장애 대응이 늦어질 것이라 생각이 들었습니다. 따라서 이 과정을 한 번 알아보고자 합니다.

## 쿠버네티스가 처음이라면!

1. 쿠버네티스는 Control Plane과 Data Plane 으로 운영을 담당하는 부분과 실제 Woker들이 동작하는 Cluster를 따로 나누어 운영하는 것을 권장합니다.
2. Control Plane은 YAML 형태로 선언한 구성 정보를 실제 클러스터 상태와 비교하며 달라질 경우, 지속적으로 선언한 구성으로 돌아가고자 합니다.
3. 쿠버네티스를 이루는 각 모듈은 이 과정에서 서로 통신하지 않고 오직 API Server와만 통신합니다. API Server를 통해 ETCD에 저장된 상태를 체크하고 **현재 상태와 원하는 상태가 다르면 필요한 작업을 수행합니다.**

이것이 쿠버네티스의 기본적인 철학입니다. 따라서 `kubectl apply -f pod.yaml`라는 CLI를 통해 Pod를 생성하기 위해선 API Server에 요청을 필수로 보내야 한다는 것이고 API Server와의 통신 결과로 Pod가 생성되는 것입니다. 지금부터 이 과정을 보다 자세히 알아보겠습니다. 

---

## kubectl apply -f Pod.yaml

`kubectl` 매니징 하는 입장에서 가장 많이 사용하는 Client 도구입니다. 사용자가 직접 명령어를 통해 API Server에  HTTP 요청을 보내 리소스를 조회하거나 조작합니다. 

```yaml
---
apiVersion: v1
kind: Pod
metadata:
  name: nginx-pod
  labels:
    app: nginx
spec:
  containers:
    - name: nginx
      image: nginx:latest
      ports:
        - containerPort: 80
```

가장 기본적인 Pod를 생성하는 YAML 파일입니다. 우리는 이를 `RUNNING` 형태의 `Pod`로 만들기 위해서는 `kubectl apply -f pod.yaml` 이란 명령어를 실행하여 Pod를 생성합니다. 그렇다면 이 과정에서 kubectl은 어떤 역할을 하고 어떤 과정이 발생할까요?

1. *kubectl은 먼저 API Server 보내기 전 YAML을 JSON으로 파싱한다.*
2. *kubectl은  API Server와 통신하며 요청을 ‘검증’하는 과정을 거친다.*

**[kubectl apply -f pold.yaml  실행 시 발생하는 것]**

```yaml
k apply -f pod.yaml --v=6
I0212 09:32:16.728845 1129992 loader.go:395] Config loaded from file:  /root/.kube/config
I0212  GET https://192.168.0.200:6443/openapi/v3?timeout=32s 200 OK in 14 milliseconds
I0212  GET https://192.168.0.200:6443/openapi/v3/api/v1?hash=EBC437E2734C2A5E649C8BB42D0B7D11384F5C16EBAC6C6EBE3D7DBCBE80D184507EC752D56427C4A43A49AB92306FC7B7790B2B13982382DC4525B719ABDA2F&timeout=32s 200 OK in 19 milliseconds
I0212  GET https://192.168.0.200:6443/api?timeout=32s 200 OK in 1 milliseconds
I0212  GET https://192.168.0.200:6443/apis?timeout=32s 200 OK in 1 milliseconds
I0212  GET https://192.168.0.200:6443/api/v1/namespaces/argocd/pods/my-pod 404 Not Found in 3 milliseconds
I0212  GET https://192.168.0.200:6443/api/v1/namespaces/argocd 200 OK in 3 milliseconds
I0212 09:32:16.879483 1129992 round_trippers.go:553] POST https://192.168.0.200:6443/api/v1/namespaces/argocd/pods?fieldManager=kubectl-client-side-apply&fieldValidation=Strict 201 Created in 29 milliseconds
pod/my-pod created
I0212 09:32:16.879891 1129992 apply.go:546] Running apply post-processor function
```

1.  **Config 로딩**
    
    가장 먼저 `kubectl`은  `$HOME/.kube/config` 에 존재하는 `Config` 파일을 로딩하고 API Server의 IP를 확인합니다. `Config` 파일에는 API Server와 통신하기 위한 여러가지 정보가 있고 그 중 Token과 API Server의 EndPoint를 kubectl은 확인합니다. 
    
2. **API Server에 OpenAPI Spec을 요청하여 리소스 정보를 가져옵니다.**
3. **Open API Spec을 기준으로 JSON을 검증합니다.**
    
    이 과정에서 유저의 YAML 파일을 JSON으로 변환하며 변환된 JSON을 읽으며, API Server의 Open API 스펙과 비교하여 필수 필드 누락 여부를 검증하고 잘못된 필드가 있다면 오류를 반환하고 종료됩니다.
    
    e.g) apiVersion이 잘못됨, YAML 타입이나 구조가 잘못됨
    
4. **API Server에 기존에 이미 생성된 Pod가 있는지 사전 체크합니다.**
5. Namespace가 존재하는지 체크합니다.
6. Pod 생성 요청을 보냅니다.

### **의문이었던 것**

> 왜 클라이언트 사이드에서 사전 검증을할까?
> 
1. 네트워크 비용 절감 및 서버 리소스 절약을 위함입니다.
2. Fast Fail 하기 위함입니다.

> 그렇다면 왜 Open API Spec을 항상 요청할까? 매번 Open API Spec을 요청하는 것이 네트워크 낭비 아닐까, 캐싱 해두고 사용하면 더 좋을 것 같다 라는 생각을 했습니다.
> 

**[이유]**

1. Kubernetes는 동적으로 리소스가 추가되거나 변경될 수 있는 **확장 가능한 API 서버 모델**을 가지고 있기 때문에 **최신 OpenAPI 정보를 항상 가져와야 합니다.**
2. 예를 들어 CRD를 통해 새로운 리소스 타입이 추가될 수 있고 특정 API 그룹이 활성화되거나 비활성화될 수 있기 때문입니다.

**성능을 위해 kubectl이 한 노력**

1. 위 같은 고민을 kubectl도 하지 않은 것이 아닙니다. 따라서 다음과 같은 일종의 캐싱 매커니즘을 지원합니다.
2. ETag(해시) 기반 요청으로 불필요한 데이터 전송을 방지합니다.
    1. OpenAPI 요청을 할 때, 이전 응답의 ETag를 함께 보냅니다.
    2. API 서버가 같은 해시값을 가지고 있다면, 변경이 없다고 판단하고 304 modified를 응답합니다. 

> 즉, 내용 변경이 없다면 불필요한 데이터 다운로드를 하지 않습니다.
> 

**[결론: OpenAPI 스펙을 매번 가져오는 이유]**

1. **Kubernetes API가 동적으로 변경되기 때문에 최신 정보를 가져와야 함.**
2. **CRD 같은 동적 리소스를 즉시 반영하기 위해 필요함.**
3. **Kubernetes 버전 업그레이드로 인한 API 변경 사항을 반영할 수 있음.**
4. **kubectl과 API 서버의 버전 차이로 인한 불일치를 방지할 수 있음.**
5. **ETag 기반 요청을 사용해 불필요한 네트워크 트래픽을 줄이고 있음.**

즉, 단순한 네트워크 낭비가 아니라 **Kubernetes의 동적인 특성을 반영하기 위한 최적화된 설계입니다.**

## API Server 가 요청을 받았다.

![image.png](attachment:0e5fca1c-eebf-4489-a716-8771e2b5a605:image.png)

여기서부터가 이제 핵심?이 되는 부분입니다. `kubectl`로부터 요청을 받은 API Server는 다음 단계를 거칩니다.

```
인증 -> 인가 -> Addmission Control -> ETCD 저장
```

인증/인가부터 수행합니다.  이후 Addmission Control가 API 요청을 가로채서 Validation 처리와 Mutation (변형) 을 처리합니다. 

### **인증**

- Kubernetes API 서버는 여러 가지 인증 방식을 지원하며, 설정에 따라 X.509 인증서나 Bearer 토큰 등을 검증합니다.
- **X.509 인증서 검증:**
    - X.509 인증서는 주로 TLS 통신에서 사용되며, 클라이언트 인증에도 활용됩니다.
        
        X.509 인증서를 통해 외부 요청의 신뢰성을 판단하고, 해당 클러스터에 접근 가능한  Client에서 요청이 발생한 것인지 검증합니다. 만약, 신뢰할 수 있는 인증서이지만 Control Plane와  다른 인증서를 가지고 요청을 한다면 API Server에 다른 클러스터 정보가 들어올 수 있습니다.
        

### 인가

- 인증 과정을 통해 클라이언트의 신원을 검증하고, 다음으로 클라이언트의 권한을 체크하는 ‘인가’ 처리를 진행합니다.  인가는 사용자가 해당 요청을 수행할 수 있는 권한을 가지고 있는지 검증합니다. 이 때 정책 기반 검증을 진행하며 이를 RBAC (Role-Based Access Control)을 사용합니다.
    
    이를 활용해, 특정 유저는 READ 권한만 허용하는 등 최소 권한 원칙을 준 수 할 수 있습니다.
    
- **ETCD와 통신:**
    - 핵심은 **Role**과 **RoleBinding**이 **ETCD**에 저장되고, API 서버가 요청을 받으면 **ETCD**에서 해당 정보를 조회하여 사용자가 **Pod 생성**을 할 수 있는지 확인하는 것입니다.
    - **Role 및 RoleBinding:**
        - **Role**은 네임스페이스 내에서 리소스에 대한 권한을 정의합니다. 예를 들어, Pod 리소스에 대해 create, get, list, delete 등의 권한을 지정할 수 있습니다.
        - **RoleBinding**은 특정 사용자나 서비스 계정에 **Role**을 바인딩하여 해당 권한을 부여하는 역할을 합니다.

![                                                                                    전체 흐름 ](attachment:d86b8bdb-ab89-4e99-bda6-dc0b39cd87fc:image.png)

                                                                                    전체 흐름 

## 전송 보안

client가 API Server로 요청을 보내는 것부터 시작입니다. 따라서 우리는 쿠버네티스 세상의 네트워크에 대한 이해도가 필요합니다. 하지만 이 부분은 지금은 다루지 않고 간단하게만 언급하고자 합니다. 

1. 기본적으로 API Server는 TLS에 의해 보호되는 첫번째 non-localhost 네트워크 인터페이스의 6443 포트에서 수신 대기 중입니다. 
    1. 수신 대기 IP 주소는 `—bind-address` 플래그를 통해 변경할 수 있습니다.
2. 쿠버네티스는 Root Certificate, Server Certificate, Client Certificate 3가지 인증서를 기반으로 독자적인 PKI (Public Key Infrastructure)를 구성하고 있습니다.
3. API 서버는 인증서를 제시합니다. 이러한 인증서는 사설 인증 기관(CA)에 기반하여 서명되거나, 혹은 공인 CA와 연결된 공개키 인프라스트럭처에 기반합니다.

### 왜 전송 보안을 해야할까요?

> 클러스터 구성원이란 인증과 클라이언트 요청의 무결성과 신뢰성 확보을 위함
> 

Kubernetes는 기본적으로 고가용성을 위한 클러스터링을 지원하는 시스템입니다. 이를 위해 Control Plane과 Data Plane이 서로 다른 물리적 위치에 분산되어 운영될 수 있으며, 멀티 클라우드와 하이브리드 환경에서도 동작합니다. 또한, Kubernetes는 클러스터의 안정성을 유지하기 위해 노드들을 여러 지역에 분산 배치할 수 있으며, 각 Node 역시 다양한 지역(zone)에서 운영될 수 있습니다.

이처럼, Kubernetes는 동적인 네트워크 모델을 기반으로 하여, 다양한 환경에서 높은 가용성과 확장성을 제공하려고 합니다. **이러한 환경에서는 데이터를 안전하게 보호하고, 클러스터 간 통신의 무결성을 보장하기 위해 TLS 통신이 필수적입니다. 즉 요청자의 신원을 판단해 클러스터에 등록된 구성원인지 검증되어야 하며, 구성원이 신뢰할 수 있는 구성원인지 검증되어야 합니다.** 

따라서, Kubernetes에서 TLS를 사용하는 것은 단순히 보안적인 측면뿐만 아니라, 분산된 클러스터 환경에서 신뢰할 수 있는 통신을 보장하는 중요한 요소로, 이를 통해 각 컴포넌트 간의 안전한 데이터 전송을 보장하고, 다양한 네트워크 환경에서의 안정적인 운영을 가능하게 합니다. 인증서 교체와 같은 추가적인 관리 작업이 필요하지만, 이는 클러스터의 보안과 안정성을 위한 필수적인 트레이드 오프라고 할 수 있습니다.

### 그렇다면 우리의 운영 포인트는?

1. **자동화된 TLS 관리**: 사용되는 인증서는 기본적으로 유효 기간이 1년인 자체 서명된 인증서입니다. 따라서 인증서의 만료일을 추적하지 않으면 클러스터의 통신에 문제가 생길 수 있습니다.
    
    **[자동화]**
    
    - 인증서 만료 모니터링
    - 인증서 갱신 스크립트 작성 or Cert Manager를 사용한 인증서 관리
    
    **[Tip]**
    
    > 인증서 기간 체크 명령어
    > 
    
    ```bash
    kubeadm certs check-expiration
    ```