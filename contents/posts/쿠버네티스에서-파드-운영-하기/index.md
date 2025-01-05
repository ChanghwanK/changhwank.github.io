---
title: "쿠버네티스트 환경에서 Pod 안정적으로 운영하기"
description: "쿠버네티스 환경에서 서비스에서 Pod로 떠있는 Application들을 어떻게하면 안정적으로 관리할 수 있을지 정리해보았습니다."
date: 2025-01-05
update: 2025-01-05
tags:
  - Kubernetes
  - DevOps
series: "쿠버네티스트 환경에서 서비스 안정적으로 운영하기"
---


## 들어가며

**비즈니스를 운영하는 엔지니어 입장에서 가장 Risky 한 것은 서비스 장애로 인한 사용자 경험을 저해시켜 서비스의 신뢰도를 떨어트리는 것이라 생각합니다.** 그렇다고 해서 장애가 0%인 서비스가 있는 것은 아닙니다. 하지만 “장애가 없는 서비스는 없어!” 하고 방치하는 것은 무책임한 것 처사라 생각합니다.

우리의 역할은 **장애를 최소한으로 줄이는 것이 우리의 역할이자 책임이라 생각합니다**. 특히 DevOps  Engineering을 한다면 그 책임과 역할이 더욱 클 것입니다. 그렇기에 **이번 포스팅을 통해 조금 더 안정적으로 서비스를 안정적으로 운영하기 위한 여러가지 방법들을 정리합니다.**

---

## 1. Deployment 를 활용하라

쿠버네티스 환경에서 서비스를 운영한다면 안정성을 높일 수 있는 메커니즘을 제공합니다. 따라서 쿠버네티스 환경에서는 어렵지 않게 안정성을 높일 수 있는데 그 시작을 위한 첫 번째는 `Deployment`라는 Workload 를 활용하는 것입니다.

쿠버네티스의 Deployment는 애플리케이션의 선언적 업데이트와 롤백을 관리하는 방법을 제공하는 API 오브젝트이며 다음과 같은 특징들을 가지고 있습니다.

1. **파드 관리 및 업데이트:** Deployment는 ReplicaSet(레플리카셋)을 사용하여 지정된 수의 파드 복제본을 유지 관리합니다. 사용자는 Deployment를 통해 애플리케이션을 업데이트할 때 새로운 이미지로 Pod를 안전하게 Rollout 할 수 있습니다.
2. **롤백:** Deployment는 변경 사항을 쉽게 되돌릴 수 있도록 지원하여, 새로운 업데이트에 문제가 있을 때 이전 Revision으로 롤백 할 수 있는 기능을 제공합니다.
3. **Probe**: Deployment는 업데이트 중에 파드의 상태를 모니터링하고, 정해진 기준에 맞지 않는 경우 재시작시켜 문제를 해결할 수 있도록 합니다.

Deployment의 이러한 특징들은 Pod의 안정성을 높이는데 크게 기여합니다. 특히 Probe 메커니즘과 Replica는 안정성의 핵심이라 볼 수 있으며 Rollback을 통해 문제를 빠르게 원복 시키는 것이 가능합니다.

Deployment를 사용해 서비스를 운영할 때는 Replica Count를 2개 이상으로 고정하는 것을 추천하며 하나의 Pod가 Down 되어도 Replica를 통해 트래픽을 지속적으로 처리 가능합니다.

하지만 Replica 설정으로만 모든 트래픽을 처리할 수 있는 것은 아닙니다. Kubernetes 입장에서 Pod의 상태가 정상이지만 애플리케이션이 트래픽을 처리할 수 없는 상태일 수 없기 때문입니다. 따라서 트래픽을 처리할 수 없는 Pod로 트래픽을 보내지 않는 메커니즘이 필요한데 이는 **Probe**를 통해 달성할 수 있습니다.

**Probe**에는 `startup`, `liveness`, `readiness`이 있습니다. (각각의 특징은 여기서 다루지 않고 다음에 다루도록 하겠습니다.) 이러한 Probe들을 활용하면 Kubernetes는 Pod의 상태를 판단할 수있게되고, Healthy한 Pod로만 트래픽을 보내어 트래픽을 안정적으로 처리 할 수 있게됩니다.

### **핵심 정리**

1. Replica는 최소 2개이상
2. 다양한 Probe 설정하기 

---

## 2. 분산배치 (토폴리지 분산) 하라

서비스를 운영할 때 Node들은 Availability Zone을 다르게 설정합니다. 이러한 메커니즘은 하나의 IDC에 문제가 생겨도 전체 서비스에 영향 가는 것을 막기 위한 것인데 Pod도 동일합니다. Pod또한 Node 별로 분산배치하여 하나의 Node가 죽었을 때 모든 Pod이 죽지 않도록 해야합니다.


기본 설정의 Deployment를 통해 Replica를 운영한다면 Node에는 같은 Pod가 여러 개 동작할 수 있습니다. 운이 좋지 않다면 하나의 Node에 Replica들이 모두 분포될 수 있는데 이때 Node가 중단된다면, 전체 서비스가 Down된 것이 됩니다. 따라서 하나의 Node에 모든 Replica들이 분포되지 않도록 분산 배치하는 것이 중요합니다. 분산배치를 위한 메커니즘 크게 두 가지입니다.

1. **Pod Anti Affinity**
2. **topologySpreadConstraints**

**Pod Anti Affinity**

- **Pod AntiAffinity는 특정 Pod들이 서로 다른 노드에 배치되도록 하는 설정입니다.** 예를 들어, 높은 가용성을 위해 같은 서비스의 여러 인스턴스가 같은 노드에 모두 위치하지 않도록 할 수 있습니다.
- AntiAffinity는 주로 Label Selector를 사용하여 특정 레이블을 가진 Pod들과의 근접성을 제어합니다. 예를 들어, 같은 애플리케이션의 다른 인스턴스와는 다른 노드에 배치되어야 함을 명시할 수 있습니다.

```yaml
---
apiVersionL apps/v1
kind: Deployment
spec:
  replicas: 2
  template: 
    spec:
      containers:
      - name: my-container
        ....
      affinity:
        podAntiAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            - labelSelector:
                matchExpressions:
                  - key: "app"
                    operator: In
                    values:
                      - myapp
              topologyKey: "kubernetes.io/hostname"
```

**topologySpreadConstraints**

- topologySpreadConstraints는 클러스터 내의 특정 토폴로지(예: 노드, 랙, 존 등)에 걸쳐 Pod들이 균등하게 분포되도록 하는 설정입니다. 이는 클러스터의 리소스 사용률을 최적화하고, 특정 지역에 서비스 중단이 발생했을 때 영향을 최소화하는 데 유용합니다.
- 사용자는 `maxSkew`, `topologyKey`, `whenUnsatisfiable` 같은 파라미터를 설정하여 원하는 분산 정도와 행동을 정의할 수 있습니다. 예를 들어, `maxSkew: 1`은 지정된 토폴로지 경계 내에서모든 Pod의 수가 하나 이상 차이 나지 않도록 한다는 것을 의미합니다.

```yaml
---
apiVersion: apps/v1
kind: Deployment
spec:
  replicas: 2
  template: 
    spec:
      topologySpreadConstraints:
        - maxSkew: 1
          topologyKey: "kubernetes.io/hostname"
          whenUnsatisfiable: DoNotSchedule
          labelSelector:
            matchLabels:
              app: myapp
      containers:
      - name: mycontainer
        ....
```

- **topologyKey**: Pod들이 분산될 기준이 되는 탑올로지 키를 지정합니다. 여기서는 `"kubernetes.io/hostname"`을 사용하여 각 Pod가 다른 호스트에 배치되도록 합니다.
- **whenUnsatisfiable**: 스케줄링 옵션이 만족되지 않을 때의 행동을 지정합니다. `DoNotSchedule`은 조건을 만족하는 노드가 없을 경우 새로운 Pod를 스케줄하지 않습니다.
- **labelSelector**: 이 제약조건이 적용될 Pod들의 Label Selector입니다. 이 경우 `app: myapp` 레이블을 가진 Pod들이 대상입니다.

정리하면 `Pod AntiAffinity`는 주로 다른 특정 Pod와의 배치를 회피하는 데 초점을 맞추는 반면, `topologySpreadConstraints`는 클러스터 전반에 걸쳐 Pod의 균등한 분포를 조정하는 데 더 적합합니다.

---

## 3. Graceful Down을 설정하라

Graceful Shtudown 설정은 Pod가 실행중인 작업을 안전하게 종료한 후, Pod를 종료시키는 것을 의미합니다. 만약 Pod가 실행 중인 작업이 안전하게 종료되지 않고 종료될 경우 리소스 낭비(DB 커넥션 반납실패)와 네트워크 입장에서는 갑자기 연결이 끊기는 현상과 같은 장애가 발생합니다.
{: .prompt-info }

Pod의 Life Cycle은 kubelet이 관장합니다. kubelet은 `SIGTERM` 시그널을 보내어 Graceful 한 종료를 유도하는데 Pod는 SIGTERM 시그널을 받으면 프로세스를 정리하고 종료할 준비를 합니다. 그러나, 일부 Pod은 `SIGTERM` 시그널을 무시하는 경우가 있는데  이 경우  kubelet은 `terminationGracePeriodSeconds` 에 지정된 시간 동안 대기하며, 이 시간 내에 컨테이너가 종료되지 않는다면 `SIGKILL` 시그널을 보내어 강제 종료시킵니다. 따라서 이렇게 `SIGKILL` 로 인해 종료된 Pod는 Graceful 하게 종료되지 못하기 때문에 리소스가 낭비 되거나 HTTP Connection이 끊어져 502 Error로 이어질 수 있습니다.  

이를 방지하기 위해 Pod는 2가지 옵션을 통해 Gracefule Down을 지원합니다.

1. **terminationGracePeriodSeconds:** terminationGracePeriodSeconds은 Pod를 안전하게 종료시키기 위한 설정 값으로 kubelet이 `SIGTERM` 시그널을 보낸 후부터 **완전히 종료될 때까지 기다리는 시간(초)입니다.** 
    
    이 시간동안 Pod는 하던 일을 마무리하고 정상적으로 프로세스 자원들은 반납 후 죽습니다.
    
2. **preStop:** preStop은 Kubernetes에서 제공하는 Lifecycle hook 중 하나로, pod가 종료되기 전에 실행되는 Hook 입니다.  preStop은 terminationGracePeriodSeconds 값이 설정된 시간 내에 실행을 완료해야 하며, Pod가 종료되기 전 마지막 작업을 처리하도록 해줍니다.
    
    Pod이 종료될 때  종료 전에 DB 연결을 종료하고 트랜잭션을 Commit하고 종료해야 하거나 File System (FS)을 정리하고 종료해야 하는 상황 등이 있을 수 있습니다. 이 때는 terminationGracePeriodSeconds 만으로는 Graceful 한 종료를 보장할 수 없는데 이를 위해 **preStop이란 것이 존재합니다.**
    

### 만약 springboot를 사용한다면

Application에서 graceful 설정을 추가하고 preStop에 sleep 설정하는 것으로 달성할 수 있습니다. 추가로 preStop Hook을 통해 Kubernetes의 네트워크 리소스를 정리하는 시간을 벌어 종료되는 Pod에 트래픽을 전달하지 않도록 할 수 있습니다.


```yaml
---
server:
  shutdown:
   graceful 

spring:
  lifecycle:
      timeout-per-shutdown-phase: 10s

```

Spring Context는 종료 시점에 사용하던 bean들을 정리하는 등의 Context를 정리하는 코드를 shutdown-hook으로 추가합니다. 

```yaml
---
apiVersion: v1
kind: Pod
metadata:
  name: springboot
spec:
  containers:
  - name: springboot
    image: my-springboot
	lifecycle:
      preStop:
        exec:
          command: 
            - "sh"
            - "-c"
            - "sleep 30"
```

`preStop`에 `sleep`이 필요한 이유는 SIGTERM을 받은 Pod에 대한 네트워크 리소스 정리를 하는데 시간이 필요하기 때문입니다. sleep하는 동안 Endpoints Controller에서 Pod의 IP를 지우고 API Server에 반영하여 kube proxy가 iptables 정보를 변경하는 시간을 버는 것입니다.  이러한 Update를 통해 더 이상 비정상 Pod에 트래픽을 보내지 않게합니다.

---

### 출처

- https://wlsdn3004.tistory.com/14
- https://yang1s.tistory.com/33