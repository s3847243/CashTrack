package org.example.repository;

import java.util.Optional;

import org.example.entities.UserInfo;
import org.example.entities.UserInfoDto;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.data.repository.CrudRepository;
import org.springframework.stereotype.Repository;

@Repository
@EnableJpaRepositories
public interface UserRepository extends CrudRepository<UserInfo, String>
{

    Optional<UserInfo> findByUserId(String userId);

}