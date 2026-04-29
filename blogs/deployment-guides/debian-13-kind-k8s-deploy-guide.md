# Debian 13 VPS 上部署 kind Kubernetes 集群完整指南

本文记录如何在一台全新的 Debian 13 VPS 上安装 Docker、kubectl、kind，并创建一个可用于学习、测试和模拟故障场景的 Kubernetes 集群。

适合场景：

- Kubernetes 学习环境
- Pod / Deployment / Service 测试
- K8s 自动诊断平台 MVP 测试
- 模拟 CrashLoopBackOff / ImagePullBackOff / Pending 等异常
- 一台 VPS 上模拟多 Node 集群

---

## 一、环境说明

本文默认环境：

- 系统：Debian 13 trixie
- 权限：root 用户
- 虚拟化：KVM VPS
- 用途：kind 本地 Kubernetes 测试集群

kind 的 Node 本质上是 Docker 容器，因此一台 VPS 上也可以模拟多个 Kubernetes Node。

例如：

```text
VPS
 └── Docker
     ├── diag-lab-control-plane
     ├── diag-lab-worker
     └── diag-lab-worker2
```

---

## 二、推荐 VPS 配置

最低配置：

- 2 vCPU
- 4GB RAM
- 30GB Disk

更推荐：

- 4 vCPU
- 8GB RAM
- 50GB+ Disk

如果要创建多节点 kind 集群，建议至少 4C8G。

---

## 三、更新系统

先更新系统，并安装基础工具：

```bash
apt update && apt upgrade -y
apt install -y curl wget vim nano ca-certificates gnupg lsb-release apt-transport-https
```

---

## 四、安装 Docker

kind 依赖 Docker，因此第一步要安装 Docker Engine。

### 1. 移除旧版本或冲突包

```bash
apt remove -y docker.io docker-doc docker-compose podman-docker containerd runc || true
```

### 2. 添加 Docker 官方 GPG key

```bash
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg \
 -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
```

这一步的作用是让 apt 可以验证 Docker 官方软件包的签名，确保软件包来源可信。

### 3. 添加 Docker Debian 13 软件源

```bash
echo \
 "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
 https://download.docker.com/linux/debian \
 $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
 > /etc/apt/sources.list.d/docker.list
```

这一步的作用是告诉 Debian 使用 Docker 官方仓库安装 Docker Engine。

### 4. 安装 Docker

```bash
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

### 5. 启动 Docker

```bash
systemctl enable docker
systemctl start docker
```

### 6. 验证 Docker

```bash
docker version
docker run --rm hello-world
```

如果能看到 Hello from Docker!，说明 Docker 已经安装成功。

---

## 五、安装 kubectl

kubectl 是 Kubernetes 的命令行工具。

```bash
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl
rm -f kubectl
```

验证：

```bash
kubectl version --client
```

---

## 六、安装 kind

kind 是 Kubernetes in Docker，可以在 Docker 容器中启动 Kubernetes 节点。

```bash
curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.31.0/kind-linux-amd64
chmod +x ./kind
mv ./kind /usr/local/bin/kind
```

验证：

```bash
kind version
```

---

## 七、创建单节点 Kubernetes 集群

先创建一个最简单的单节点集群测试环境：

```bash
kind create cluster --name dev
```

验证集群：

```bash
kubectl cluster-info --context kind-dev
kubectl get nodes -o wide
kubectl get pods -A
```

正常情况下会看到一个 control-plane 节点：

```text
dev-control-plane Ready control-plane
```

如果只是测试安装是否成功，测试完可以删除：

```bash
kind delete cluster --name dev
```

---

## 八、创建多节点 Kubernetes 集群

实际测试中更建议创建多节点集群，例如：

- 1 个 control-plane
- 2 个 worker

创建 kind 配置文件：

```bash
cat > kind-multi-node.yaml <<'EOF'
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
 - role: control-plane
 - role: worker
 - role: worker
EOF
```

创建集群：

```bash
kind create cluster --name diag-lab --config kind-multi-node.yaml
```

查看节点：

```bash
kubectl get nodes -o wide
```

正常会看到类似：

```text
diag-lab-control-plane Ready control-plane
diag-lab-worker Ready <none>
diag-lab-worker2 Ready <none>
```

---

## 九、部署 nginx 测试应用

创建一个 nginx Deployment：

```bash
kubectl create deployment nginx --image=nginx:1.25
```

扩容到 3 个副本：

```bash
kubectl scale deployment nginx --replicas=3
```

查看 Pod 分布：

```bash
kubectl get pods -o wide
```

你可以看到 nginx Pod 被调度到了不同的 kind worker 节点上。

---

## 十、暴露 nginx Service

创建 NodePort 类型的 Service：

```bash
kubectl expose deployment nginx --port=80 --target-port=80 --type=NodePort
```

查看 Service：

```bash
kubectl get svc
```

输出类似：

```text
NAME TYPE CLUSTER-IP EXTERNAL-IP PORT(S)
nginx NodePort 10.96.xxx.xxx <none> 80:31234/TCP
```

其中：

- 80 是 Service 端口
- 31234 是 NodePort 端口

---

## 十一、使用 port-forward 临时访问 nginx

如果只是临时测试，可以使用：

```bash
kubectl port-forward svc/nginx 8080:80
```

你会看到：

```text
Forwarding from 127.0.0.1:8080 -> 80
Forwarding from [::1]:8080 -> 80
```

这表示只监听在当前 VPS 的本地地址：

```text
127.0.0.1:8080
```

保持这个命令不退出，另开一个 SSH 窗口，在同一台 VPS 上访问：

```bash
curl http://127.0.0.1:8080
```

如果希望外部机器访问，需要绑定 0.0.0.0：

```bash
kubectl port-forward --address 0.0.0.0 svc/nginx 8080:80
```

然后通过：

```text
http://你的VPS公网IP:8080
```

访问。

注意：如果 VPS 开了防火墙，需要放行 8080：

```bash
ufw allow 8080/tcp
```

---

## 十二、kind 中 NodePort 暴露到宿主机的注意点

kind 的 Node 是 Docker 容器，因此 NodePort 默认不一定直接暴露到 VPS 宿主机公网。

如果希望 kind 集群中的 NodePort 映射到 VPS 宿主机端口，需要在创建 kind 集群时配置 extraPortMappings。

例如创建一个把宿主机 8080 映射到 kind Node 30080 的集群：

```bash
cat > kind-nginx-port.yaml <<'EOF'
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
 - role: control-plane
   extraPortMappings:
   - containerPort: 30080
     hostPort: 8080
     protocol: TCP
 - role: worker
 - role: worker
EOF
```

删除旧集群：

```bash
kind delete cluster --name diag-lab
```

重新创建：

```bash
kind create cluster --name diag-lab --config kind-nginx-port.yaml
```

创建 nginx：

```bash
kubectl create deployment nginx --image=nginx:1.25
kubectl scale deployment nginx --replicas=3
```

创建固定 NodePort 的 Service：

```bash
cat > nginx-nodeport.yaml <<'EOF'
apiVersion: v1
kind: Service
metadata:
 name: nginx
spec:
 type: NodePort
 selector:
   app: nginx
 ports:
 - port: 80
   targetPort: 80
   nodePort: 30080
EOF
kubectl apply -f nginx-nodeport.yaml
```

此时在 VPS 本机测试：

```bash
curl http://127.0.0.1:8080
```

外部访问：

```bash
http://你的VPS公网IP:8080
```

---

## 十三、常用检查命令

查看节点：
`kubectl get nodes -o wide`

查看所有 Pod：
`kubectl get pods -A -o wide`

查看 Service：
`kubectl get svc -A`

查看事件：
`kubectl get events -A --sort-by='.lastTimestamp'`

查看集群信息：
`kubectl cluster-info`

查看 kind node 容器：
`docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'`

进入 kind node 容器：
`docker exec -it diag-lab-control-plane bash`

---

## 十四、检查 kubelet 是否正常

在 kind 中，kubelet 运行在 kind node 容器内部，不是在 VPS 宿主机 systemd 中。

因此不能在宿主机直接执行：
`systemctl status kubelet`

应该这样查看：
`docker exec diag-lab-control-plane systemctl status kubelet`

查看 worker 节点 kubelet：
`docker exec diag-lab-worker systemctl status kubelet`

查看 kubelet 日志：
`docker exec diag-lab-worker journalctl -u kubelet -n 100 --no-pager`

也可以通过 Kubernetes API 间接判断：

```bash
kubectl get nodes
kubectl describe node diag-lab-worker
```

---

## 十五、模拟常见 Kubernetes 异常

kind 很适合用来模拟 Pod、Deployment、Service、调度类异常。

### 1. 模拟 ImagePullBackOff

```bash
kubectl create deployment bad-image --image=nginx:not-exist-tag
```

查看：

```bash
kubectl get pods
kubectl describe pod -l app=bad-image
```

你会看到：

- ErrImagePull
- ImagePullBackOff

---

### 2. 模拟 CrashLoopBackOff

```bash
cat > crashloop.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
 name: crashloop-demo
spec:
 containers:
 - name: app
   image: busybox
   command: ["sh", "-c", "echo start && exit 1"]
EOF
kubectl apply -f crashloop.yaml
```

查看：

```bash
kubectl get pod crashloop-demo
kubectl describe pod crashloop-demo
kubectl logs crashloop-demo --previous
```

---

### 3. 模拟 Pending / FailedScheduling

创建一个资源请求极大的 Pod：

```bash
cat > pending-demo.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
 name: pending-demo
spec:
 containers:
 - name: app
   image: nginx
   resources:
     requests:
       cpu: "100"
       memory: "100Gi"
EOF
kubectl apply -f pending-demo.yaml
```

查看：

```bash
kubectl get pod pending-demo
kubectl describe pod pending-demo
```

通常会看到：

- FailedScheduling
- Insufficient cpu
- Insufficient memory

---

## 十六、模拟 Node 异常

kind 的 Node 是 Docker 容器，因此可以通过停止容器模拟 Node 异常。

查看 kind node 容器：
`docker ps --format 'table {{.Names}}\t{{.Status}}'`

停止一个 worker：
`docker stop diag-lab-worker`

查看 Kubernetes Node 状态：
`kubectl get nodes`

恢复：
`docker start diag-lab-worker`

再次查看：
`kubectl get nodes`

注意：这只是模拟 Node NotReady，和真实物理机或云主机宕机不完全一样。

---

## 十七、kind 的适用场景 and 限制

kind 适合测试：

- CrashLoopBackOff
- ImagePullBackOff
- CreateContainerConfigError
- Pending / FailedScheduling
- Deployment rollout 卡住
- Service selector 配错
- targetPort 配错
- ConfigMap / Secret 缺失
- Job 失败
- 基础调度规则

kind 不适合完整模拟：

- 真实 Node 磁盘故障
- 真实 kubelet / containerd 故障
- 真实跨节点网络问题
- 真实 CNI 故障
- 真实云盘 CSI attach/detach
- 真实 LoadBalancer
- 真实生产 Ingress 链路

如果要更贴近真实环境，可以后续使用：

- 2～3 台 VPS + k3s
- 或多台 VPS + kubeadm

---

## 十八、删除 kind 集群

删除集群：
`kind delete cluster --name diag-lab`

删除测试文件：
`rm -f kind-multi-node.yaml kind-nginx-port.yaml nginx-nodeport.yaml crashloop.yaml pending-demo.yaml`

查看是否还有 kind 容器：
`docker ps -a | grep kind`

---

## 十九、完整快速命令版

如果你想快速从 0 跑起来，可以直接按下面顺序执行。

```bash
apt update && apt upgrade -y
apt install -y curl wget vim nano ca-certificates gnupg lsb-release apt-transport-https
apt remove -y docker.io docker-doc docker-compose podman-docker containerd runc || true
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg \
 -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo \
 "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
 https://download.docker.com/linux/debian \
 $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
 > /etc/apt/sources.list.d/docker.list
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable docker
systemctl start docker
docker run --rm hello-world
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl
rm -f kubectl
kubectl version --client
curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.31.0/kind-linux-amd64
chmod +x ./kind
mv ./kind /usr/local/bin/kind
kind version
cat > kind-multi-node.yaml <<'EOF'
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
 - role: control-plane
 - role: worker
 - role: worker
EOF
kind create cluster --name diag-lab --config kind-multi-node.yaml
kubectl get nodes -o wide
kubectl get pods -A
```

---

## 二十、总结

在 Debian 13 VPS 上部署 kind 的核心流程是：

1. 安装 Docker
2. 安装 kubectl
3. 安装 kind
4. 创建 kind 集群
5. 部署测试应用
6. 验证 Pod / Service / Node
7. 模拟常见 K8s 异常

kind 的优势是：

- 安装快
- 成本低
- 一台 VPS 可模拟多 Node
- 适合学习和自动诊断规则测试

kind 的限制是：

- Node 是 Docker 容器
- 不能完全模拟真实生产集群
- 网络、存储、Node 故障场景有限

如果目标是开发一个 K8s 自动定位平台，推荐路线是：

- 第一阶段：kind 快速构造 Pod / 调度 / Service 异常
- 第二阶段：2～3 台 VPS 部署 k3s 测真实 Node / 网络 / runtime 问题
- 第三阶段：接入预发或生产相似环境验证真实业务问题
